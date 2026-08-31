# ZJJX 飞牛 fnOS 媒体解析下载应用开发文档

**文档版本：** 1.0.0-draft  
**项目名称：** ZJJX  
**GitHub 仓库：** `ZJJX`（公开）  
**目标平台：** 飞牛 fnOS x86_64  
**开发状态：** 方案确认，可进入实现阶段  

---

## 1. 项目目标

ZJJX 是一个仅供飞牛 NAS 管理员使用的媒体解析与下载应用。

管理员在应用中粘贴一条公开内容链接，应用通过已授权的解析服务获取内容信息。解析成功后，先展示预览；只有管理员点击“确认下载”后，应用才会把媒体下载到管理员在飞牛应用设置中授权的 NAS 文件夹。

适用范围：

- 抖音、快手、Instagram，以及解析服务能够识别的其他公开平台链接；
- 仅用于下载管理员本人拥有版权或已获得保存授权的内容。

首版不实现批量粘贴、多用户协作、逐张图片选择、自动转码和任务重试。

---

## 2. 已确认的产品规则

| 项目 | 规则 |
| --- | --- |
| 用户范围 | 仅 NAS 管理员可见、可用 |
| 链接输入 | 首版一次仅提交一个链接 |
| 下载触发 | 必须先解析预览，再由管理员点击确认下载 |
| 支持平台 | 不维护固定白名单，交由解析服务识别 |
| 解析优先级 | API Key 通道优先；失败后自动尝试网页账号密码通道 |
| 网页账号密码通道 | 实验性功能，不作为首版稳定性验收条件 |
| 默认保存位置 | 在飞牛应用设置中由管理员授权和选择 NAS 文件夹 |
| 下载目录 | `{授权目录}/{平台}/{用户名}/{日期}/`，文件名使用标题 |
| 重名处理 | 自动改名：`文件名 (1).扩展名`、`文件名 (2).扩展名` |
| 图片 | 多图内容确认后默认整组下载；下载最高分辨率可用图片 |
| 视频 | 下载最高画质；仅允许 H.264 MP4 或 HEVC/H.265 MP4 |
| 其他视频格式 | 不下载，任务显示不支持的格式原因 |
| 转码 | 不转码 |
| 并发数 | 固定为 1，使用串行下载队列 |
| 文件大小 | 不设置单任务大小上限；下载前检查磁盘空间 |
| 历史记录 | 永久保留 |
| 清理历史 | 只删除应用内任务记录，不删除已下载文件 |
| 首次配置 | API Key、网页账号、网页密码、授权下载目录 |
| 凭据保存 | 应用私有配置目录，严格文件权限；不回显、不写入日志、不提交到 GitHub |
| 仓库许可证 | 不添加许可证，也不在 README 单独说明许可规则 |
| 构建方式 | GitHub Actions 手动触发 |
| 发布方式 | 手动发布时构建 FPK、更新 manifest 版本、提交到 main、创建 GitHub Release 并上传 FPK |

---

## 3. 总体架构

### 3.1 技术选择

首版采用 **原生飞牛应用包 + Node.js 22 运行时**，不采用 Docker。

原因：

1. 主功能是 HTTP 解析、预览、文件下载与任务管理，Node.js 足够；
2. 不需要数据库服务、转码服务或多容器编排；
3. FPK 体积、安装复杂度和运行资源都更可控；
4. 飞牛提供 `nodejs_v22` 运行时依赖，适合 x86_64 NAS。

网页账号密码自动备用通道保留为独立适配模块。由于尚未获得网页实际登录请求和页面元素信息，该模块在首版标记为实验性；API Key 通道为首版正式功能。

### 3.2 访问方式

使用飞牛 **统一网关** 提供应用入口：

```text
浏览器
  ↓
飞牛统一网关：/app/zjjx
  ↓（Unix Socket）
ZJJX Node.js 服务：${TRIM_APPDEST}/app.sock
```

统一网关带来的要求：

- 服务端必须读取并校验 `X-Trim-Isadmin: true`；
- 不仅依赖 `allUsers=false` 隐藏入口；
- 所有 API 请求都在后端按管理员身份再次校验；
- 前端不能得到 API Key、网页账号或网页密码。

### 3.3 模块划分

```text
浏览器前端
├── 链接输入页
├── 解析预览页
├── 下载任务历史页
└── 设置提示页

Node.js 后端
├── 网关身份校验
├── 配置读取与保护
├── API Key 解析器（正式）
├── 网页登录解析器（实验性备用）
├── 解析结果标准化
├── 单线程下载队列
├── 文件命名与目录管理
├── 视频容器/编码校验
└── 历史记录存储
```

---

## 4. 飞牛应用包设计

### 4.1 项目目录

```text
ZJJX/
├── app/
│   ├── server/
│   │   ├── index.mjs
│   │   ├── lib/
│   │   │   ├── auth.mjs
│   │   │   ├── config.mjs
│   │   │   ├── parser-api.mjs
│   │   │   ├── parser-web-fallback.mjs
│   │   │   ├── media-normalizer.mjs
│   │   │   ├── download-queue.mjs
│   │   │   ├── downloader.mjs
│   │   │   ├── video-validator.mjs
│   │   │   ├── task-store.mjs
│   │   │   └── filename.mjs
│   │   └── public/
│   │       ├── index.html
│   │       ├── app.js
│   │       └── app.css
│   └── ui/
│       ├── config
│       └── images/
│           ├── icon_64.png
│           └── icon_256.png
├── cmd/
│   ├── install_init
│   ├── install_callback
│   ├── main
│   ├── upgrade_init
│   ├── upgrade_callback
│   ├── uninstall_init
│   ├── uninstall_callback
│   ├── config_init
│   └── config_callback
├── config/
│   ├── privilege
│   └── resource
├── wizard/
│   ├── install
│   └── config
├── scripts/
│   ├── release-version.mjs
│   ├── verify-fpk.mjs
│   └── package-app.mjs
├── .github/
│   └── workflows/
│       └── release.yml
├── manifest
├── ICON.PNG
├── ICON_256.PNG
├── README.md
└── .gitignore
```

### 4.2 manifest

初版关键字段如下。`os_min_version` 不应猜测，必须在实际飞牛设备测试后再补充。

```ini
appname=ZJJX
version=0.1.0
display_name=ZJJX
desc=媒体链接解析、预览与下载工具
source=thirdparty
platform=x86
maintainer=ZJJX
desktop_uidir=ui
desktop_applaunchname=ZJJX.Application
ctl_stop=true
checkport=false
disable_authorization_path=false
install_dep_apps=nodejs_v22
```

说明：

- 使用 `platform=x86` 对应目标 x86_64 NAS；
- `checkport=false`，因为服务使用 Unix Socket 而非固定 TCP 端口；
- `disable_authorization_path=false`，保留飞牛应用设置中的目录授权能力；
- `ctl_stop=true`，管理员可以在应用中心控制服务状态。

### 4.3 权限配置

`config/privilege`：

```json
{
  "defaults": {
    "run-as": "package"
  },
  "username": "zjjx",
  "groupname": "zjjx"
}
```

规则：

- 服务不以 root 身份长期运行；
- 不申请不必要的 `join-groups`；
- 只写入飞牛明确授权给应用的目录；
- 配置文件、下载临时文件、任务数据均位于应用专属目录。

### 4.4 资源配置

首版不声明共享目录或 Docker 项目：

```json
{}
```

下载目录不是应用公开共享目录，而是管理员通过飞牛应用设置授权给应用访问的路径；后端从 `TRIM_DATA_ACCESSIBLE_PATHS` 读取。

### 4.5 应用入口

`app/ui/config`：

```json
{
  ".url": {
    "ZJJX.Application": {
      "title": "ZJJX",
      "icon": "images/icon_{0}.png",
      "type": "iframe",
      "protocol": "",
      "gatewayPrefix": "/app/zjjx",
      "gatewaySocket": "app.sock",
      "url": "/app/zjjx",
      "allUsers": false,
      "control": {
        "accessPerm": "readonly"
      }
    }
  }
}
```

应用内服务须监听：

```text
${TRIM_APPDEST}/app.sock
```

---

## 5. 配置、生命周期与安全

### 5.1 首次配置与设置

`wizard/install` 和 `wizard/config` 使用以下字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `wizard_api_key` | password | 解析服务 API Key |
| `wizard_web_username` | text | 网页备用通道账号 |
| `wizard_web_password` | password | 网页备用通道密码 |

下载路径不通过普通文本框收集。管理员需要在飞牛应用设置中为 ZJJX 授权一个或多个目录；应用从 `TRIM_DATA_ACCESSIBLE_PATHS` 读取，并使用第一个有效目录作为默认目标。

若没有授权目录，解析功能可以使用，但“确认下载”按钮必须禁用并提示管理员先在飞牛应用设置中授权目录。

### 5.2 私有配置文件

配置文件保存位置：

```text
${TRIM_PKGETC}/config.json
```

保存规则：

- 使用 JSON，不记录历史明文；
- 文件权限设为仅应用包用户可读写；
- 配置更新时先写入同目录临时文件，再原子替换；
- 后端 API 仅返回 `apiKeyConfigured`、`webAccountConfigured` 等布尔状态；
- 绝不把 Key、密码、完整鉴权 Header 写入日志、任务详情、浏览器响应或 GitHub Actions 输出。

### 5.3 生命周期

`cmd/main` 必须支持：

| 参数 | 行为 |
| --- | --- |
| `start` | 清理遗留 Socket，启动 Node 服务，记录 PID |
| `stop` | 优雅停止服务与当前下载；设置停止超时 |
| `status` | 运行中返回 0，未运行返回 3 |

关键环境变量：

- `TRIM_APPDEST`：服务、静态文件和 Unix Socket 路径；
- `TRIM_PKGETC`：配置文件；
- `TRIM_PKGVAR`：任务历史、下载临时文件、PID；
- `TRIM_DATA_ACCESSIBLE_PATHS`：管理员授权的下载目录；
- `TRIM_TEMP_LOGFILE`：安装、升级、配置、启动失败时给用户展示的错误信息；
- `TRIM_SYS_ARCH`：启动诊断时确认架构。

---

## 6. 解析与下载流程

### 6.1 API Key 正式通道

解析请求：

```http
POST https://jx.wxss.dpdns.org/api/shortcut/resolve
Content-Type: application/json
X-API-Key: <仅后端持有>
```

请求体：

```json
{
  "url": "管理员提交的目标链接",
  "quality": "hd",
  "format": "video"
}
```

后端必须设置连接、响应和总请求超时，并对非 2xx、无效 JSON、`success=false` 分别保存可读错误码。

已确认的图片类成功响应包含：

```json
{
  "success": true,
  "type": "images",
  "platform": "instagram",
  "author": "作者",
  "title": "标题",
  "thumbnail": "封面地址",
  "image_urls": ["图片地址1", "图片地址2"]
}
```

如果下载地址属于解析服务 `/api/` 路径，下载请求必须继续携带相同 `X-API-Key`；其他公网媒体地址不附带该 Key。

### 6.2 网页账号密码备用通道

触发条件：

1. API Key 解析通道失败；
2. 已配置网页账号与密码；
3. 实验性模块处于启用状态。

模块职责：

- 自动登录网页；
- 提交待解析链接；
- 获取与 API 通道等价的标准化媒体信息；
- 不把 Cookie、账号、密码或 HTML 原文暴露到前端。

限制：

- 当前未掌握网页登录请求和页面选择器；
- 该模块必须独立于 API Key 主流程；
- 首版验收不依赖它成功；
- 页面改版后仅更新 `parser-web-fallback.mjs`，不影响下载队列和前端。

### 6.3 解析预览

提交链接后，应用只做解析，不创建下载任务。

预览页展示：

- 平台、作者、标题、封面；
- 媒体类型：单视频、单图片或图片组；
- 图片数量或视频信息；
- 可下载/不可下载状态；
- “确认下载”与“取消”按钮。

多图片内容确认后默认下载全部图片，不提供逐张选择。

### 6.4 视频格式策略

下载前后均做校验：

1. 下载 URL 必须为 HTTPS；
2. HTTP `Content-Type` 必须符合预期；
3. 视频必须为 MP4 容器；
4. MP4 视频轨仅接受 `avc1`（H.264）、`hvc1` 或 `hev1`（HEVC/H.265）；
5. 其他编码或容器删除临时文件并将任务标记为失败；
6. 不执行转码。

由于视频解析响应字段尚未提供样例，`media-normalizer` 使用可配置字段映射，优先识别常见视频字段：

```text
video_url
video_urls
download_url
url
media_url
```

若接口结构不匹配，任务显示“解析响应中未找到受支持的视频地址”，仅记录经过脱敏后的字段名，不记录完整响应中的敏感地址。

### 6.5 下载目录与文件命名

目录规则：

```text
{TRIM_DATA_ACCESSIBLE_PATHS 中的已授权目录}/
└── instagram/
    └── 用户名/
        └── 2026-08-31/
            ├── 清理后的标题-001.jpg
            ├── 清理后的标题-002.jpg
            └── 清理后的标题.mp4
```

规则：

- 平台、用户名和日期均作为独立路径片段；平台和用户名过滤 Windows/NAS 非法字符，平台目录统一使用小写；
- 日期取 NAS 当前本地日期，格式 `YYYY-MM-DD`；
- 用户名优先使用解析结果中的 `unique_id`、`uid`、`userId`、`user_id` 等账号标识，其次使用 `author_username`、`author_handle`、`username` 等字段；抖音直播结果同时兼容嵌套的 `liveInfo.owner`、`liveInfo.remarks`（主播昵称）和 `liveInfo.uid`（抖音号）；若接口只返回昵称，则使用主播昵称；
- 标题过滤 Windows/NAS 非法字符，并作为文件名；
- 标题为空时使用 `{平台}-{用户名}-{任务短 ID}`；
- 路径片段不得包含 `..`、路径分隔符或控制字符；
- 图片组直接保存到日期目录，不再建立标题目录；图片文件按 `{标题}-001`、`{标题}-002` 顺序命名；
- 下载到同目录 `.part` 临时文件，成功校验后原子改名；
- 若目标文件存在，自动追加 ` (n)`；
- 路径必须标准化并确认仍在授权目录之内。

### 6.6 网络安全

下载器必须拒绝：

- 非 HTTP/HTTPS URL；
- `localhost`、回环地址、私有 IPv4、链路本地 IPv4；
- 本地 IPv6、链路本地 IPv6、唯一本地 IPv6；
- 重定向后指向上述地址的 URL；
- 超过允许重定向次数的请求。

这样可以避免解析结果或重定向被用于访问 NAS 本地管理服务。

---

## 7. 任务与历史记录

### 7.1 任务状态

```text
parsed              已解析，等待管理员确认
queued              已确认，等待下载
downloading         正在下载
succeeded           全部媒体下载成功
failed              解析、校验或下载失败
cancelled           管理员在预览阶段取消
```

### 7.2 串行队列

- 队列并发固定为 1；
- 当前任务结束后才开始下一个；
- 服务重启后，将未完成任务标记为失败，原因：`服务重启导致任务中断`；
- 首版不提供手动重试；管理员可以重新解析链接。

### 7.3 历史记录存储

存储位置：

```text
${TRIM_PKGVAR}/tasks.json
```

使用原子文件替换避免断电导致 JSON 损坏：

```text
tasks.json.tmp → fsync → rename → tasks.json
```

每条历史记录包含：

- 任务 ID；
- 创建/完成时间；
- 平台、作者、标题、媒体类型；
- 媒体数量；
- 当前状态和进度；
- 成功的相对保存路径；
- 失败码和用户可读错误；
- 不保存 API Key、密码、Cookie、完整鉴权 Header。

### 7.4 清理历史

历史页提供“清理历史”按钮：

- 点击后必须二次确认；
- 仅删除 `${TRIM_PKGVAR}/tasks.json` 内任务记录；
- 已下载媒体文件永久保留；
- 清理完成后保留一个空的有效任务库文件。

---

## 8. 前端页面与后端接口

### 8.1 页面

| 页面 | 内容 |
| --- | --- |
| 首页 | 单链接输入、解析按钮、配置状态提示 |
| 解析预览 | 内容元数据、缩略图、图片列表或视频信息、确认下载 |
| 任务历史 | 任务列表、状态、进度、成功/失败原因 |
| 设置提示 | 提示到飞牛应用设置中修改凭据和授权目录 |

### 8.2 后端 API

所有 API 都先执行网关管理员校验。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/app/zjjx/api/health` | 服务健康状态与配置状态 |
| `POST` | `/app/zjjx/api/resolve` | 解析一个链接，仅返回预览 |
| `POST` | `/app/zjjx/api/downloads` | 根据预览令牌确认创建下载任务 |
| `GET` | `/app/zjjx/api/tasks` | 获取历史任务 |
| `GET` | `/app/zjjx/api/tasks/:id` | 获取任务详情和进度 |
| `DELETE` | `/app/zjjx/api/tasks` | 清理应用内全部历史记录 |

预览令牌规则：

- 后端生成随机、高熵、短时有效令牌；
- 令牌关联解析结果和当前管理员身份；
- 不接受前端重新提交任意下载 URL；
- 令牌默认有效期建议 30 分钟；
- 过期后要求重新解析。

---

## 9. GitHub 仓库与 Actions 发布方案

### 9.1 仓库约定

- 仓库名称：`ZJJX`；
- 仓库公开；
- `main` 为发布主分支；
- 不添加许可证文件；
- `.gitignore` 必须忽略本地配置、测试媒体、构建产物、`.fpk`、`node_modules` 与日志。

建议 `.gitignore`：

```gitignore
node_modules/
dist/
*.fpk
*.log
.env
.env.*
config.local.json
test-media/
coverage/
```

### 9.2 手动发布工作流

工作流文件：`.github/workflows/release.yml`

触发方式：

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: Release version, for example 1.0.0
        required: true
        type: string
```

工作流步骤：

1. 限制仅从 `main` 分支执行；
2. 校验版本符合 `X.Y.Z` 语义化版本格式；
3. 检查 `vX.Y.Z` 标签和 Release 不存在；
4. 使用 `scripts/release-version.mjs` 更新 `manifest` 中的 `version`；
5. 安装 Node.js 22 与项目构建依赖；
6. 构建前端/服务文件并执行基础测试；
7. 下载指定版本的 Linux AMD64 `fnpack`；
8. 执行 `fnpack build`；
9. 检查生成的 FPK，重命名为 `ZJJX-X.Y.Z.fpk`；
10. 提交更新后的 `manifest` 到 `main`；
11. 创建并推送 `vX.Y.Z` 标签；
12. 创建 GitHub Release；
13. 上传 `.fpk` 到 Release；
14. 同时上传 `.fpk` 为 Actions Artifact。

### 9.3 fnpack 下载配置

不要在工作流中猜测或硬编码不确定的下载地址。

在 GitHub 仓库 Variables 中配置：

```text
FNPACK_URL
```

值为经过验证的飞牛官方 Linux AMD64 `fnpack` 下载地址。工作流使用该变量下载工具并校验可执行性。

### 9.4 Actions 权限与并发保护

```yaml
permissions:
  contents: write

concurrency:
  group: zjjx-release
  cancel-in-progress: false
```

`contents: write` 仅用于：

- 提交 `manifest` 版本变更；
- 创建 Git 标签；
- 创建 GitHub Release。

任何构建、测试或 FPK 校验失败都必须在推送版本提交、标签和 Release 之前停止。

---

## 10. 开发阶段

### 阶段 A：应用骨架

- 创建 FPK 目录结构；
- 完成 manifest、权限、资源、图标和统一网关入口；
- 完成 `cmd/main`；
- 在 x86_64 飞牛 NAS 验证安装、启动、停止和网关访问。

**验收：** 可以从飞牛桌面以管理员身份打开 ZJJX 空白页面。

### 阶段 B：配置与权限

- 完成安装/配置向导；
- 保存私有配置文件；
- 读取授权目录；
- 未授权目录时阻止下载。

**验收：** API Key、账号和密码不出现在页面、日志和 API 响应中。

### 阶段 C：API Key 解析与预览

- 实现 `/api/shortcut/resolve`；
- 标准化图片结果；
- 完成解析预览和确认下载流程；
- 补充真实抖音/快手视频响应字段映射。

**验收：** 提交链接后仅显示预览，不会自动写入 NAS。

### 阶段 D：下载器与历史

- 实现单线程队列；
- 实现图片组下载、目录命名、重名改名；
- 实现 H.264/HEVC MP4 校验；
- 实现历史记录和清理历史。

**验收：** 已确认任务按规定目录下载；清理历史后文件仍存在。

### 阶段 E：网页备用通道（实验性）

- 在真实账号环境记录登录流程；
- 实现网页登录和解析适配；
- API Key 失败时自动尝试一次备用解析；
- 验证页面改版时的失败提示。

**验收：** 不影响 API Key 主流程；失败可诊断，不泄露账号或 Cookie。

### 阶段 F：发布自动化

- 完成手动 GitHub Actions；
- 验证版本更新、FPK 构建、标签、Release 与附件；
- 在干净飞牛 NAS 环境安装 Release 中的 FPK。

---

## 11. 发布前验收清单

### 飞牛包

- [ ] `manifest`、`config/privilege`、`config/resource` 是有效格式；
- [ ] 包含 `ICON.PNG`、`ICON_256.PNG` 与入口图标；
- [ ] `fnpack build` 成功；
- [ ] 管理员可打开应用，非管理员无法调用后端接口；
- [ ] `start`、`stop`、`status` 返回正确状态码；
- [ ] 服务监听 `${TRIM_APPDEST}/app.sock`。

### 功能

- [ ] API Key 解析成功；
- [ ] 解析后不会自动下载；
- [ ] 预览确认后才建立下载任务；
- [ ] 图片组默认完整下载；
- [ ] H.264 MP4 和 HEVC MP4 可下载；
- [ ] 非 MP4 或不支持编码的视频被拒绝；
- [ ] 路径符合“平台/用户名/日期/文件”规则；
- [ ] 重名文件自动改名；
- [ ] 任务一次只下载一个；
- [ ] 历史记录永久保留；
- [ ] 清理历史不删除媒体文件。

### 安全

- [ ] API Key、账号、密码不出现在浏览器响应、日志、构建日志和 Git 历史；
- [ ] 所有后端接口检查 `X-Trim-Isadmin`；
- [ ] 下载路径始终在飞牛授权目录内；
- [ ] 下载器阻止内网、回环和重定向 SSRF；
- [ ] 外部媒体 URL 不附带不必要的 API Key；
- [ ] 解析服务 `/api/` 媒体 URL 正确携带 API Key。

### GitHub Release

- [ ] 工作流只能手动触发；
- [ ] 版本号合法且未发布；
- [ ] `manifest` 版本已同步并提交；
- [ ] `vX.Y.Z` 标签与 Release 已创建；
- [ ] Release 含对应 `ZJJX-X.Y.Z.fpk`；
- [ ] FPK 可在干净 x86_64 飞牛 NAS 安装。

---

## 12. 实现前仍需在真实环境确认的事项

以下事项不阻碍开始主功能开发，但需要在阶段 C/E 联调时补齐：

1. 抖音和快手视频成功响应中，实际视频地址字段名称；
2. 解析服务对视频质量和 `format` 参数的完整规则；
3. 解析服务网页登录请求、Cookie 生命周期和页面选择器；
4. 飞牛应用设置中授权多个目录时，ZJJX 的默认目录选择规则；
5. 目标飞牛 fnOS 版本与 Node.js 22 运行时包的实际兼容性；
6. 当前官方 Linux AMD64 `fnpack` 的稳定下载地址。

这些确认项应通过真实 NAS 的测试记录补充到仓库 `docs/compatibility.md`，而不是写入凭据或测试媒体链接。

---

## 13. 下一步

按本开发文档实施时，建议先完成 **阶段 A + 阶段 B + 阶段 C 的 API Key 图片解析**，在真实 NAS 通过后，再加入视频下载、历史记录与实验性网页登录备用通道。
