require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PullRefresh'
  s.version        = package['version']
  s.summary        = 'Native pull-to-refresh container'
  s.description    = s.summary
  s.license        = { :type => 'MIT' }
  s.authors        = { 'Zhihu--' => 'noreply@example.invalid' }
  s.homepage       = 'https://example.invalid/zhihu--'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://example.invalid/zhihu--.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
