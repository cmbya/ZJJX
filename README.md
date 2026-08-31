# ZJJX

ZJJX 是一个面向飞牛 fnOS 管理员的媒体链接解析、预览与下载应用。首版采用原生 FPK + Node.js 22，不使用 Docker、不提供批量粘贴、不自动转码。

## 当前功能

- 通过解析服务 API Key 解析一条公开链接；
- 先显示平台、作者、标题、封面和媒体类型，管理员确认后才创建下载任务；
- 支持单视频、单图片和图片组，图片组默认整组下载；
- 下载目录为“授权目录 / 平台 / 用户名 / 日期 / 文件”，文件名使用内容标题；重名自动追加 `(1)`；
- 固定串行下载队列，永久保留应用内历史记录；清理历史不会删除已下载文件；
- 下载地址仅允许 HTTPS，并拒绝回环、私有网段、链路本地地址和不安全重定向；
- 视频仅接受 MP4 容器，且必须检测到 H.264 或 HEVC 编码；不执行转码；
- 所有 API 均再次校验飞牛统一网关的 `X-Trim-Isadmin: true`。

网页账号密码备用通道保留了独立适配模块，但当前未绑定具体网页登录接口，首版验收以 API Key 通道为准。

## 在飞牛上安装

1. 在 GitHub Actions 的 `Build and release FPK` 中手动运行，输入三段式版本号，例如 `0.1.0`。
2. 首次运行前，在仓库 Settings → Secrets and variables → Actions → Variables 中新增 `FNPACK_URL`，填入已经验证的飞牛官方 Linux AMD64 `fnpack` 下载地址。
3. 从 GitHub Release 下载 `ZJJX-x.y.z.fpk`，在飞牛应用中心手动安装。
4. 在 ZJJX 应用设置中填写解析服务 API Key，并授权一个下载目录。
5. 打开 ZJJX，粘贴链接，点击“解析预览”，确认内容后点击“确认下载”。

由于 `os_min_version` 需要真实设备验证，当前 manifest 没有填写该字段。首次安装后请在飞牛设备上完成基础回归测试，再决定是否补充最低系统版本。

## 本地检查

项目不依赖第三方 npm 包，Node.js 22 即可运行测试：

```bash
npm test
npm run package:app
```

本地调试服务时可以设置：

```bash
ZJJX_ALLOW_LOCAL_ADMIN=1 \
ZJJX_CONFIG_DIR="$PWD/.zjjx-etc" \
ZJJX_VAR_DIR="$PWD/.zjjx-var" \
ZJJX_DOWNLOAD_ROOT="$PWD/test-media" \
node app/server/index.mjs
```

生产环境由 `cmd/main` 将服务监听到 `${TRIM_APPDEST}/app.sock`，由飞牛统一网关以 `/app/zjjx` 提供访问。

### 启动失败时查看日志

详细日志固定写入 `${TRIM_PKGVAR}/zjjx.log`。如果应用安装在飞牛的第 2 个存储卷，实际路径通常是 `/vol2/@appdata/ZJJX/zjjx.log`；其他卷将 `vol2` 替换为对应卷号。飞牛弹出的启动失败提示会同时显示该日志的最后 60 行。

## 安全约束

API Key、网页账号和网页密码只写入 `${TRIM_PKGETC}/config.json`，文件权限为 `0600`；前端只接收布尔配置状态，日志和任务历史不会保存凭据、Cookie 或完整鉴权 Header。应用只使用管理员授权目录，下载文件采用临时 `.part` 文件完成后原子改名。

本项目仅用于保存管理员本人拥有版权或已获得保存授权的内容。
