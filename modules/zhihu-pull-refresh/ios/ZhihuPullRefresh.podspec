require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ZhihuPullRefresh'
  s.version        = package['version']
  s.summary        = 'Native pull-to-refresh container for Zhihu--'
  s.description    = s.summary
  s.license        = { :type => 'MIT' }
  s.authors        = { 'Zhihu--' => 'noreply@example.invalid' }
  s.homepage       = 'https://example.invalid/zhihu--'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://example.invalid/zhihu--.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
