# 发布指南

Android 与 iOS 使用不同的 GitHub-hosted runner，但位于同一次 workflow run：Ubuntu job 生成 APK，macOS job 生成未签名 IPA，两个 job 通过 GitHub Actions artifact 将文件交给最终的 Release job。最终 job 会自动下载两个平台的产物，不需要在本地中转或手动上传 IPA。

## 发布前准备

1. 同步修改 `package.json` 和 `app.json` 中的版本号。
2. 将准备发布的提交推送到 `main`。工作流只允许从 `main` 创建 Release。
3. 在仓库 `Settings → Secrets and variables → Actions` 中配置 `EXPO_TOKEN`。Android 的本地 EAS Build 需要该 token。
4. 如需 Firebase 配置，可额外设置 `FIREBASE_ANDROID_JSON_B64`；未设置时会跳过该步骤。
5. 确认目标 tag（例如 `v0.5.0`）尚不存在。同一版本不会覆盖已有 Release 或产物。

## 一次运行完成两个平台

1. 打开仓库的 `Actions` 页面。
2. 选择 **Build Android + iOS and Release**。
3. 点击 **Run workflow**，选择 `main`。
4. 默认不勾选 `publish_release`：构建完成后创建草稿 Release，适合先检查产物。勾选后会直接公开发布。

工作流依次执行：

1. 运行 TypeScript、Biome、全部测试及富文本 fixture 分析。
2. 质量检查通过后，并行构建 arm64-v8a preview APK 和未签名 IPA。
3. 两个平台分别上传临时 artifact。
4. Release job 下载全部 artifact，生成 `SHA256SUMS.txt`，并创建与 `package.json` 版本对应的 tag 和 Release。
5. GitHub 根据 `.github/release.yml` 和 PR label 自动生成发布说明。

如果任一平台构建失败，Release job 不会运行。修复后可以在该 workflow run 中重跑失败 job，或重新触发工作流。构建 artifact 默认保留 7 天；Release 中的附件不受该临时保留期影响。

## 发布产物

- `zhihu-minus-minus-v<version>-preview-arm64-v8a.apk`：Android arm64-v8a preview 包。
- `zhihu-minus-minus-v<version>-unsigned.ipa`：未签名 iOS 包，需要用户自行处理签名和安装环境。
- `SHA256SUMS.txt`：两个安装包的 SHA-256 校验值。

默认的草稿流程仍需在 Releases 页面确认内容并点击发布。若勾选 `publish_release`，成功完成构建后会直接公开，无需再操作。

## Pull Request 检查

`.github/workflows/ci.yml` 会在 Pull Request 及 `main` push 时运行 `npm ci`、类型检查、Biome、三组测试和富文本 fixture 分析。建议在分支保护规则中将 CI 的 **TypeScript, Biome and tests** job 设置为合并前必须通过。
