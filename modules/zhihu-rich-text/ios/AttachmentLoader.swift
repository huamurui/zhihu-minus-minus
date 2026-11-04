import CryptoKit
import Foundation
import ImageIO
import SDWebImage
import SDWebImageSVGCoder
import UIKit

internal struct RichTextAttachmentAsset {
  let image: UIImage
  let width: CGFloat
  let height: CGFloat
  let baselineOffset: CGFloat?
}

/** A cancelled request never delivers an attachment into a newer document. */
internal final class RichTextAttachmentRequest {
  private let lock = NSLock()
  private var cancelled = false
  private var cancelHandler: (() -> Void)?

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let handler = cancelHandler
    cancelHandler = nil
    lock.unlock()
    handler?()
  }

  fileprivate func onCancel(_ handler: @escaping () -> Void) {
    lock.lock()
    if cancelled {
      lock.unlock()
      handler()
    } else {
      cancelHandler = handler
      lock.unlock()
    }
  }
}

/** Anonymous, bounded downloads and color-independent process-local assets. */
internal enum RichTextAttachmentLoader {
  private static let maximumBytes = 4 * 1024 * 1024
  private static let maximumBitmapSide: CGFloat = 2048
  private static let cache = NSCache<NSString, AttachmentCacheEntry>()
  private static let stateQueue = DispatchQueue(label: "zhihu.richtext.attachments.state")
  private static let decodeQueue: OperationQueue = {
    let queue = OperationQueue()
    queue.name = "zhihu.richtext.attachments.decode"
    queue.qualityOfService = .userInitiated
    queue.maxConcurrentOperationCount = 2
    return queue
  }()
  private static var jobs: [String: AttachmentJob] = [:]

  @discardableResult
  static func load(
    spec: [String: Any],
    fontSize: CGFloat,
    maxWidth: CGFloat,
    scale: CGFloat = 1,
    completion: @escaping (RichTextAttachmentAsset?) -> Void
  ) -> RichTextAttachmentRequest? {
    guard let source = spec["url"] as? String, !source.isEmpty,
          source.utf8.count <= maximumBytes * 3 + 256,
          fontSize.isFinite, fontSize > 0,
          maxWidth.isFinite, maxWidth > 0,
          scale.isFinite, scale > 0 else {
      DispatchQueue.main.async { completion(nil) }
      return nil
    }
    let request = RichTextAttachmentRequest()
    let identifier = UUID()
    let key = cacheKey(source: source, spec: spec, fontSize: fontSize, maxWidth: maxWidth, scale: scale)
    request.onCancel {
      stateQueue.async {
        guard let job = jobs[key] else { return }
        job.waiters.removeValue(forKey: identifier)
        if job.waiters.isEmpty {
          jobs.removeValue(forKey: key)
          job.task?.cancel()
        }
      }
    }
    stateQueue.async {
      guard !request.isCancelled else { return }
      cache.totalCostLimit = 24 * 1024 * 1024
      cache.countLimit = 128
      if let cached = cache.object(forKey: key as NSString) {
        deliver(cached.asset, request: request, completion: completion)
        return
      }
      let waiter = AttachmentWaiter(request: request, completion: completion)
      if let job = jobs[key] {
        job.waiters[identifier] = waiter
        return
      }
      let job = AttachmentJob(waiters: [identifier: waiter])
      jobs[key] = job
      let decode: (Data?) -> Void = { data in
        decodeQueue.addOperation {
          let asset = data.flatMap {
            decodeAsset(data: $0, source: source, spec: spec, fontSize: fontSize, maxWidth: maxWidth, scale: scale)
          }
          stateQueue.async {
            guard jobs[key] === job else { return }
            jobs.removeValue(forKey: key)
            if let asset {
              let cost = asset.image.cgImage.map { $0.bytesPerRow * $0.height } ?? 1
              cache.setObject(AttachmentCacheEntry(asset), forKey: key as NSString, cost: cost)
            }
            for waiter in job.waiters.values {
              deliver(asset, request: waiter.request, completion: waiter.completion)
            }
          }
        }
      }
      if source.lowercased().hasPrefix("data:image/") {
        decodeQueue.addOperation { decode(dataImage(source)) }
      } else if let url = anonymousURL(source) {
        job.task = AttachmentDownloader.shared.load(url: url, completion: decode)
      } else {
        decode(nil)
      }
    }
    return request
  }

  private static func deliver(
    _ asset: RichTextAttachmentAsset?,
    request: RichTextAttachmentRequest,
    completion: @escaping (RichTextAttachmentAsset?) -> Void
  ) {
    DispatchQueue.main.async {
      if !request.isCancelled { completion(asset) }
    }
  }

  private static func cacheKey(
    source: String, spec: [String: Any], fontSize: CGFloat, maxWidth: CGFloat, scale: CGFloat
  ) -> String {
    let digest = SHA256.hash(data: Data(source.utf8)).map { String(format: "%02x", $0) }.joined()
    let width = richTextNumber(spec["width"], fallback: 0)
    let height = richTextNumber(spec["height"], fallback: 0)
    let baseline = richTextNumber(spec["baselineOffset"], fallback: .nan)
    return "\(digest):\(spec["kind"] as? String ?? "image"):\(width):\(height):\(baseline):\(fontSize):\(maxWidth):\(scale)"
  }

  private static func dataImage(_ source: String) -> Data? {
    guard let comma = source.firstIndex(of: ",") else { return nil }
    let header = source[..<comma].lowercased()
    let payload = String(source[source.index(after: comma)...])
    let data: Data?
    if header.hasSuffix(";base64") {
      data = Data(base64Encoded: payload, options: .ignoreUnknownCharacters)
    } else {
      data = payload.removingPercentEncoding.map { Data($0.utf8) }
    }
    return data.flatMap { $0.count <= maximumBytes ? $0 : nil }
  }

  fileprivate static func anonymousURL(_ source: String) -> URL? {
    guard let url = URL(string: source),
          ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
          url.host != nil, url.user == nil, url.password == nil else { return nil }
    return url
  }

  private static func optionalSize(_ spec: [String: Any], _ key: String, scale: CGFloat) -> CGFloat? {
    let value = CGFloat(richTextNumber(spec[key], fallback: .nan)) * scale
    return value.isFinite && value > 0 ? value : nil
  }

  private static func decodeAsset(
    data: Data, source: String, spec: [String: Any], fontSize: CGFloat, maxWidth: CGFloat, scale: CGFloat
  ) -> RichTextAttachmentAsset? {
    guard !data.isEmpty, data.count <= maximumBytes else { return nil }
    let isFormula = spec["kind"] as? String == "formula"
    let screenScale = min(3, max(1, UIScreen.main.scale))
    let limit = maximumBitmapSide / screenScale
    let explicitWidth = optionalSize(spec, "width", scale: scale)
    let explicitHeight = optionalSize(spec, "height", scale: scale)
    let baselineValue = CGFloat(richTextNumber(spec["baselineOffset"], fallback: .nan)) * scale
    let explicitBaseline = baselineValue.isFinite ? baselineValue : nil
    let prefix = String(decoding: data.prefix(512), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    let isSVG = source.lowercased().hasPrefix("data:image/svg+xml") || prefix.hasPrefix("<svg") || prefix.hasPrefix("<?xml")
    var image: UIImage
    var width: CGFloat
    var height: CGFloat
    var baseline: CGFloat?
    if isSVG {
      guard let markup = String(data: data, encoding: .utf8),
            let metrics = AttachmentSVGDocument.parse(markup) else { return nil }
      let intrinsicWidth = svgLength(metrics.attributes["width"], fontSize: fontSize).flatMap { $0 > 0 ? $0 : nil }
      let intrinsicHeight = svgLength(metrics.attributes["height"], fontSize: fontSize).flatMap { $0 > 0 ? $0 : nil }
      let canvasWidth = intrinsicWidth ?? metrics.viewBoxSize?.width ?? explicitWidth ?? fontSize * 2
      let canvasHeight = intrinsicHeight ?? metrics.viewBoxSize?.height ?? explicitHeight ?? fontSize * 1.3
      width = explicitWidth ?? explicitHeight.map { $0 * canvasWidth / canvasHeight } ?? canvasWidth
      height = explicitHeight ?? width * canvasHeight / canvasWidth
      let intrinsicScale = height / canvasHeight
      let fit = min(1, min(maxWidth / width, limit / max(width, height)))
      width = max(1, width * fit)
      height = max(1, height * fit)
      baseline = explicitBaseline.map { $0 * fit }
        ?? metrics.verticalAlign.flatMap { svgLength($0, fontSize: fontSize) }.map { $0 * intrinsicScale * fit }
      guard let renderedData = metrics.rasterMarkup(markup, size: CGSize(width: canvasWidth, height: canvasHeight), formula: isFormula),
            let bitmap = SDImageSVGCoder.shared.decodedImage(with: renderedData, options: [
              .decodeThumbnailPixelSize: NSValue(cgSize: CGSize(width: width, height: height)),
              .decodePreserveAspectRatio: false,
            ]), let raster = bitmap.cgImage,
            max(raster.width, raster.height) <= Int(maximumBitmapSide) else { return nil }
      // This coder's UIKit implementation treats its target as points and uses
      // UIGraphics' scale=0. Retain those Retina pixels with a point-sized image.
      image = UIImage(cgImage: raster, scale: CGFloat(raster.width) / width, orientation: bitmap.imageOrientation)
    } else {
      guard let source = CGImageSourceCreateWithData(data as CFData, nil),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let naturalWidth = properties[kCGImagePropertyPixelWidth] as? NSNumber,
            let naturalHeight = properties[kCGImagePropertyPixelHeight] as? NSNumber,
            naturalWidth.doubleValue > 0, naturalHeight.doubleValue > 0,
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceThumbnailMaxPixelSize: Int(maximumBitmapSide),
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceShouldCacheImmediately: true,
            ] as CFDictionary) else { return nil }
      image = UIImage(cgImage: thumbnail)
      let ratio = image.size.height / image.size.width
      width = explicitWidth ?? explicitHeight.map { $0 / ratio } ?? min(maxWidth, fontSize * 3)
      height = explicitHeight ?? width * ratio
      let fit = min(1, min(maxWidth / width, limit / max(width, height)))
      width = max(1, width * fit)
      height = max(1, height * fit)
      baseline = explicitBaseline.map { $0 * fit }
    }
    guard width.isFinite, height.isFinite, width > 0, height > 0 else { return nil }
    if isFormula { image = FormulaForegroundMask.normalized(image) }
    return RichTextAttachmentAsset(image: image, width: width, height: height, baselineOffset: baseline)
  }

  fileprivate static func svgLength(_ value: String?, fontSize: CGFloat) -> CGFloat? {
    guard let value,
          let regex = try? NSRegularExpression(pattern: "^\\s*(-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+))\\s*(ex|em|px|pt)?\\s*$", options: .caseInsensitive),
          let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
          let numberRange = Range(match.range(at: 1), in: value),
          let number = Double(value[numberRange]), number.isFinite else { return nil }
    let unit = Range(match.range(at: 2), in: value).map { value[$0].lowercased() } ?? ""
    let multiplier: CGFloat
    switch unit {
    case "ex": multiplier = fontSize * 0.5
    case "em": multiplier = fontSize
    case "pt": multiplier = 4 / 3
    default: multiplier = 1
    }
    let result = CGFloat(number) * multiplier
    return result.isFinite ? result : nil
  }
}

private final class AttachmentCacheEntry {
  let asset: RichTextAttachmentAsset
  init(_ asset: RichTextAttachmentAsset) { self.asset = asset }
}

private struct AttachmentWaiter {
  let request: RichTextAttachmentRequest
  let completion: (RichTextAttachmentAsset?) -> Void
}

private final class AttachmentJob {
  var waiters: [UUID: AttachmentWaiter]
  var task: URLSessionDataTask?
  init(waiters: [UUID: AttachmentWaiter]) { self.waiters = waiters }
}

private final class AttachmentDownloader: NSObject, URLSessionDataDelegate {
  static let shared = AttachmentDownloader()
  private static let maximumBytes = 4 * 1024 * 1024
  private let lock = NSLock()
  private var records: [Int: DownloadRecord] = [:]
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 12
    configuration.httpMaximumConnectionsPerHost = 4
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()

  func load(url: URL, completion: @escaping (Data?) -> Void) -> URLSessionDataTask {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
    request.httpShouldHandleCookies = false
    let task = session.dataTask(with: request)
    lock.lock()
    records[task.taskIdentifier] = DownloadRecord(completion: completion)
    lock.unlock()
    task.resume()
    return task
  }

  private func record(_ task: URLSessionTask) -> DownloadRecord? {
    lock.lock()
    defer { lock.unlock() }
    return records[task.taskIdentifier]
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                  didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let response = response as? HTTPURLResponse,
          (200..<300).contains(response.statusCode),
          response.expectedContentLength <= Int64(Self.maximumBytes),
          let url = response.url,
          RichTextAttachmentLoader.anonymousURL(url.absoluteString) != nil else {
      completionHandler(.cancel)
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let record = record(dataTask) else { dataTask.cancel(); return }
    guard record.data.count <= Self.maximumBytes - data.count else {
      dataTask.cancel()
      return
    }
    record.data.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock()
    let record = records.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    record?.completion(error == nil ? record?.data : nil)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                  completionHandler: @escaping (URLRequest?) -> Void) {
    guard let source = request.url?.absoluteString,
          let url = RichTextAttachmentLoader.anonymousURL(source) else {
      completionHandler(nil)
      return
    }
    // Create a fresh request so redirects cannot carry credentials or cookies.
    var anonymous = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
    anonymous.httpShouldHandleCookies = false
    completionHandler(anonymous)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust
      ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
  }
}

private final class DownloadRecord {
  var data = Data()
  let completion: (Data?) -> Void
  init(completion: @escaping (Data?) -> Void) { self.completion = completion }
}

/** SVG parser metadata also rejects secondary network/file requests and executable markup. */
private final class AttachmentSVGDocument: NSObject, XMLParserDelegate {
  var attributes: [String: String] = [:]
  private var depth = 0
  private var elements = 0
  private var valid = true

  static func parse(_ markup: String) -> AttachmentSVGDocument? {
    let lowered = markup.lowercased()
    guard !lowered.contains("<!doctype"), !lowered.contains("<!entity") else { return nil }
    let document = AttachmentSVGDocument()
    let parser = XMLParser(data: Data(markup.utf8))
    parser.shouldResolveExternalEntities = false
    parser.shouldProcessNamespaces = true
    parser.delegate = document
    guard parser.parse(), document.valid, !document.attributes.isEmpty else { return nil }
    let urls = try? NSRegularExpression(pattern: "url\\s*\\(([^)]*)\\)", options: .caseInsensitive)
    for match in urls?.matches(in: markup, range: NSRange(markup.startIndex..., in: markup)) ?? [] {
      guard let range = Range(match.range(at: 1), in: markup) else { return nil }
      let resource = markup[range].trimmingCharacters(in: CharacterSet(charactersIn: " \t\r\n\"'"))
      if !resource.hasPrefix("#") { return nil }
    }
    return document
  }

  var viewBoxSize: CGSize? {
    let values = attributes["viewBox"]?.split(whereSeparator: { $0.isWhitespace || $0 == "," }).compactMap { Double($0) }
    guard let values, values.count == 4, values.allSatisfy(\.isFinite), values[2] > 0, values[3] > 0 else { return nil }
    return CGSize(width: values[2], height: values[3])
  }

  var verticalAlign: String? {
    let style = attributes["style"] ?? ""
    let regex = try? NSRegularExpression(pattern: "(?:^|;)\\s*vertical-align\\s*:\\s*([^;]+)", options: .caseInsensitive)
    guard let match = regex?.firstMatch(in: style, range: NSRange(style.startIndex..., in: style)),
          let range = Range(match.range(at: 1), in: style) else { return nil }
    return String(style[range])
  }

  func rasterMarkup(_ markup: String, size: CGSize, formula: Bool) -> Data? {
    guard let regex = try? NSRegularExpression(pattern: "<svg(?=\\s|>)(?:\"[^\"]*\"|'[^']*'|[^'\">])*>", options: .caseInsensitive),
          let match = regex.firstMatch(in: markup, range: NSRange(markup.startIndex..., in: markup)),
          let range = Range(match.range, in: markup),
          let sizes = try? NSRegularExpression(pattern: "\\s(?:width|height)\\s*=\\s*(?:\"[^\"]*\"|'[^']*')", options: .caseInsensitive) else { return nil }
    var root = String(markup[range])
    root = sizes.stringByReplacingMatches(in: root, range: NSRange(root.startIndex..., in: root), withTemplate: "")
    root.removeLast()
    root += " width=\"\(size.width)\" height=\"\(size.height)\">"
    var result = markup.replacingCharacters(in: range, with: root)
    if formula {
      result = normalizeFormulaSVGTransforms(result)
      // Theme is applied to the bitmap mask, including explicit black and currentColor.
      let currentColor = try? NSRegularExpression(pattern: "currentColor", options: .caseInsensitive)
      result = currentColor?.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "#000000") ?? result
    }
    return Data(result.utf8)
  }

  func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
              qualifiedName qName: String?, attributes attributeDict: [String: String]) {
    depth += 1
    elements += 1
    let name = elementName.lowercased()
    if depth > 64 || elements > 25000 || ["script", "foreignobject", "iframe", "object"].contains(name) {
      valid = false
      parser.abortParsing()
      return
    }
    if depth == 1 {
      guard name == "svg" else { valid = false; parser.abortParsing(); return }
      attributes = attributeDict
    }
    for (key, value) in attributeDict {
      let attribute = key.lowercased()
      if attribute.hasPrefix("on") || ((attribute == "href" || attribute.hasSuffix(":href"))
        && !value.hasPrefix("#") && !value.lowercased().hasPrefix("data:image/")) {
        valid = false
        parser.abortParsing()
        return
      }
    }
  }

  func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
    depth -= 1
  }
}

/** Formula-only light canvas removal; the cached bitmap remains independent of theme. */
private enum FormulaForegroundMask {
  static func normalized(_ image: UIImage) -> UIImage {
    guard let cgImage = image.cgImage, cgImage.width >= 3, cgImage.height >= 3 else { return image }
    let width = cgImage.width
    let height = cgImage.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    return pixels.withUnsafeMutableBytes { buffer in
      guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return image }
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
      let insetX = Int(CGFloat(width - 1) * 0.05)
      let insetY = Int(CGFloat(height - 1) * 0.05)
      let corners = [(insetX, insetY), (width - 1 - insetX, insetY),
                     (insetX, height - 1 - insetY), (width - 1 - insetX, height - 1 - insetY)]
      let bytes = buffer.bindMemory(to: UInt8.self)
      let bright = corners.filter { x, y in
        let index = (y * width + x) * 4
        return bytes[index + 3] >= 250 && bytes[index] >= 240 && bytes[index + 1] >= 240 && bytes[index + 2] >= 240
      }.count
      guard bright >= 3 else { return image }
      for index in stride(from: 0, to: bytes.count, by: 4) {
        let alpha = Int(bytes[index + 3])
        let red = alpha == 0 ? 0 : min(255, (Int(bytes[index]) * 255 + alpha / 2) / alpha)
        let green = alpha == 0 ? 0 : min(255, (Int(bytes[index + 1]) * 255 + alpha / 2) / alpha)
        let blue = alpha == 0 ? 0 : min(255, (Int(bytes[index + 2]) * 255 + alpha / 2) / alpha)
        let luminance = (54 * red + 183 * green + 19 * blue + 128) >> 8
        let coverage = (min(176, max(0, 240 - luminance)) * 255 + 88) / 176
        bytes[index] = 0
        bytes[index + 1] = 0
        bytes[index + 2] = 0
        bytes[index + 3] = UInt8((alpha * coverage + 127) / 255)
      }
      guard let output = context.makeImage() else { return image }
      return UIImage(cgImage: output, scale: image.scale, orientation: image.imageOrientation)
    }
  }
}
