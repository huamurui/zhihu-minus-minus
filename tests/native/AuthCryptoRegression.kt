import expo.modules.crypto.aes.extensions.decrypt
import expo.modules.crypto.aes.extensions.encrypt
import expo.modules.crypto.aes.objects.SealedData
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.Path
import java.security.AlgorithmParameters
import java.security.InvalidAlgorithmParameterException
import java.security.InvalidKeyException
import java.security.Key
import java.security.Provider
import java.security.SecureRandom
import java.security.spec.AlgorithmParameterSpec
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import javax.crypto.CipherSpi
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Real JCE AES-GCM with the Android 8/8.1 Conscrypt output-size contract.
 * Only the size estimate changes; doFinal still authenticates/decrypts real data.
 * This does not execute Android Keystore, Expo's bridge, or an ARM binary.
 *
 * AOSP android-8.0.0_r1 and android-8.1.0_r1, common/src/main/java/org/conscrypt/
 * OpenSSLCipher.java, EVP_AEAD.getOutputSizeForFinal: on decrypt, the upper bound
 * includes the authentication tag, while doFinal returns the actual byte count.
 */
private class OutputBoundCipher(android8: Boolean) : Cipher(
  OutputBoundSpi(android8),
  object : Provider("AuthCryptoRegression", "1.0", "Synthetic output-size contract") {},
  "AES/GCM/NoPadding",
)

private class OutputBoundSpi(private val android8: Boolean) : CipherSpi() {
  private val delegate = Cipher.getInstance("AES/GCM/NoPadding")
  private var mode = Cipher.ENCRYPT_MODE

  override fun engineSetMode(mode: String) = Unit
  override fun engineSetPadding(padding: String) = Unit
  override fun engineGetBlockSize(): Int = delegate.blockSize
  override fun engineGetIV(): ByteArray = delegate.iv
  override fun engineGetParameters(): AlgorithmParameters = delegate.parameters
  override fun engineGetOutputSize(inputLen: Int): Int =
    if (android8 && mode == Cipher.DECRYPT_MODE) inputLen else delegate.getOutputSize(inputLen)

  @Throws(InvalidKeyException::class)
  override fun engineInit(mode: Int, key: Key, random: SecureRandom?) {
    this.mode = mode
    delegate.init(mode, key, random)
  }

  @Throws(InvalidKeyException::class, InvalidAlgorithmParameterException::class)
  override fun engineInit(mode: Int, key: Key, params: AlgorithmParameterSpec?, random: SecureRandom?) {
    this.mode = mode
    delegate.init(mode, key, params, random)
  }

  @Throws(InvalidKeyException::class, InvalidAlgorithmParameterException::class)
  override fun engineInit(mode: Int, key: Key, params: AlgorithmParameters?, random: SecureRandom?) {
    this.mode = mode
    delegate.init(mode, key, params, random)
  }

  override fun engineUpdate(input: ByteArray, offset: Int, length: Int): ByteArray =
    delegate.update(input, offset, length)

  override fun engineUpdate(input: ByteArray, offset: Int, length: Int, output: ByteArray, outputOffset: Int): Int =
    delegate.update(input, offset, length, output, outputOffset)

  override fun engineDoFinal(input: ByteArray, offset: Int, length: Int): ByteArray =
    delegate.doFinal(input, offset, length)

  override fun engineDoFinal(input: ByteArray, offset: Int, length: Int, output: ByteArray, outputOffset: Int): Int =
    delegate.doFinal(input, offset, length, output, outputOffset)

  override fun engineDoFinal(input: ByteBuffer, output: ByteBuffer): Int = delegate.doFinal(input, output)

  override fun engineUpdateAAD(input: ByteArray, offset: Int, length: Int) =
    delegate.updateAAD(input, offset, length)
}

private val key = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
private val aad = "zhihu-auth-file:v1".toByteArray(Charsets.UTF_8)

private fun seal(bytes: ByteArray, android8: Boolean): SealedData {
  val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
  val cipher = OutputBoundCipher(android8)
  cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
  cipher.updateAAD(aad)
  return cipher.encrypt(ByteBuffer.wrap(bytes))
}

private fun open(sealed: SealedData, android8: Boolean, additionalData: ByteArray = aad): ByteArray {
  val cipher = OutputBoundCipher(android8)
  cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed.ivBytes))
  cipher.updateAAD(additionalData)
  // AesCryptoModule returns the whole array, so the extension must return its
  // exact valid length rather than merely changing a ByteBuffer limit.
  return cipher.decrypt(sealed).array()
}

private fun rejectsAuthentication(operation: () -> Unit) {
  try {
    operation()
    error("Unauthenticated ciphertext was accepted")
  } catch (_: BadPaddingException) {
    // AEADBadTagException extends BadPaddingException; do not inspect messages.
  }
}

fun main(args: Array<String>) {
  val outputDirectory = Path.of(args.single())
  val json = "{\"state\":{\"accounts\":[],\"label\":\"合成🙂 é\"},\"version\":2}"
  val cases = listOf(
    "unicode-json" to json.toByteArray(Charsets.UTF_8),
    "empty" to ByteArray(0),
    "internal-nul" to "a\u0000b".toByteArray(Charsets.UTF_8),
    "trailing-nul" to "合成🙂\u0000\u0000".toByteArray(Charsets.UTF_8),
    "all-zero" to ByteArray(32),
  )
  var assertions = 0
  for (android8 in listOf(true, false)) {
    val provider = if (android8) "android8-upper-bound" else "exact-output-bound"
    for ((name, plain) in cases) {
      val restored = open(seal(plain, android8), android8)
      check(restored.contentEquals(plain)) {
        "$provider/$name: expected ${plain.size} bytes, received ${restored.size}"
      }
      assertions += 1
      if (name == "unicode-json") Files.write(outputDirectory.resolve("$provider.json"), restored)
    }
    val tampered = seal(json.toByteArray(Charsets.UTF_8), android8)
    tampered.corruptCiphertext()
    rejectsAuthentication { open(tampered, android8) }
    assertions += 1
    val valid = seal(json.toByteArray(Charsets.UTF_8), android8)
    rejectsAuthentication { open(valid, android8, "different-aad".toByteArray(Charsets.UTF_8)) }
    assertions += 1
    println("Passed $provider: Unicode, empty, embedded/trailing zeros, tampering and AAD.")
  }
  println("Passed $assertions assertions using the installed Expo cipher functions.")
}
