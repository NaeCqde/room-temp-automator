# room-temp-automator

[English](README.en.md) | 日本語

部屋の温度を定期的に取得し、あらかじめ決めた温度を「またいだ」(上昇／下降)瞬間に、トリガーごとに決めたアクションを実行する常駐ツールです。
たとえば「25.5℃を超えたらエアコンを冷房にする」「24℃以下になったら暖房にする」といった自動化ができます。

## 作った理由

Apple ホームの「オートメーション」(温度が一定以上/以下になったら…)が、条件を満たしても実行されないことがよくあるため、自分で確実に動くものを作りました。PC やラズパイなどに常駐させ、センサーを自分でポーリングして、しきい値を「またいだ」瞬間に確実にアクションを実行します。

## 温度以外にも使えます

トリガーが見ているのは「ある量の値が、しきい値を上向き/下向きにまたいだこと」だけです。センサープラグインが数値を返せば、温度に限らず次のような用途にも使えます(センサーとアクションを自分で書き足す必要があります)。

- 湿度、CO₂ 濃度、照度、電力使用量など、量的なデータの変化で機器を操作する
- 外部 API の値(気温予報、電気料金、株価など)をポーリングして通知や操作を行う

温度の取得方法(センサー)とアクションの実行方法はどちらもプラグイン形式です。

| 種類 | 組み込みプラグイン | 内容 |
|---|---|---|
| センサー | `switchbot-hub` | SwitchBot Cloud API (OpenAPI v1.1) 経由で Hub 3 / 温湿度計などの温度を取得します。 |
| アクション | `switchbot-aircon` | [switchbot-aircon](https://github.com/NaeCqde/switchbot-aircon) の HTTP API (`/parameter/...`) を呼び出します。 |

## インストール

[Releases](https://github.com/NaeCqde/room-temp-automator/releases/latest) から、お使いの環境に合う実行ファイルと `config.example.toml` をダウンロードします。

| ファイル | 対象 |
|---|---|
| `room-temp-automator-Windows-x86_64.exe` | Windows (x64) |
| `room-temp-automator-macOS-aarch64` | macOS (Apple Silicon) |
| `room-temp-automator-Linux-x86_64-musl` | Linux (x64) |
| `room-temp-automator-Linux-aarch64-musl` | Linux (arm64) |
| `config.example.toml` | 設定ファイルのテンプレート |

各実行ファイルには `.sha256` が付いています。Bun のランタイムを同梱した単体実行ファイルなので、別途インストールは不要です。macOS / Linux では `chmod +x` で実行権限を付けてください。

## セットアップ

1. `config.example.toml` を `config.toml` にコピーし、実行ファイルと同じフォルダ(実行時のカレントディレクトリ)に置きます。設定は `config.toml` だけを読み込み、環境変数(`.env`)は使いません。
2. `[sensor.config]` に SwitchBot の `token` / `secret` を設定します。取得方法: SwitchBot アプリ → プロフィール → 設定 → 基本データ → アプリバージョンを連打 → 開発者向けオプション。
3. `device_id` が分からない場合は、`token` / `secret` を設定した状態で`room-temp-automator list-devices`(ソースから実行する場合は `bun run list-devices`)を実行して一覧します。温度を測れるデバイス(Hub 3 など)の deviceId を `[sensor.config].device_id` に設定します。
4. `switchbot-aircon` を起動しておき、`[plugins.switchbot-aircon].base_url` にそのアドレスを設定します。

> `config.toml` には認証情報が含まれます。`.gitignore` で除外してあるので、コミットしないでください。

## 実行

```bash
./room-temp-automator-macOS-aarch64
./room-temp-automator-macOS-aarch64 list-devices   # SwitchBot デバイス一覧
./room-temp-automator-macOS-aarch64 --config /path/to/config.toml   # 設定ファイルを指定
```

## ソースから実行・ビルド

[Bun](https://bun.com) が必要です。

```bash
bun install
cp config.example.toml config.toml
bun run start          # 実行
bun run list-devices   # SwitchBot デバイス一覧
bun run build          # 単体実行ファイルを room-temp-automator として生成
```

## プラグインの追加

`src/plugins/sensors/` または `src/plugins/actions/` にプラグインを実装し、同ディレクトリの `index.ts` のレジストリに登録します(静的 import なので `--compile` で自動的に実行ファイルへ同梱されます)。

## config.toml の書式

```toml
[sensor]
plugin = "switchbot-hub"       # 使用するセンサープラグイン名
poll_interval_seconds = 60     # 温度を取得する間隔（秒）

[sensor.config]                # プラグインごとの設定（プラグイン実装が解釈する）
token = "..."
secret = "..."
device_id = "..."

[startup]
# 起動直後は温度の履歴が1点しかなく「またいだ」判定ができません。
# 起動時点ですでにトリガー群の中の最低temp以下/最高temp以上だった場合、
# 該当するトリガーのアクションを（境界を跨ぐのを待たず）即座に実行します。
# それぞれ個別に無効化できます。
fire_below_min = true   # 最低tempのトリガーに対する起動時実行を有効化
fire_above_max = true   # 最高tempのトリガーに対する起動時実行を有効化

[startup.custom_action]
# 上記の fire_below_min / fire_above_max のどちらにも該当しない温度で起動したときに
# 実行するカスタムアクション。デフォルトは無効(enabled = false)で、その場合
# plugin / payload は空でも構いません。
enabled = false
plugin = ""
payload = ""

# トリガー: id をキーにした辞書(例: [triggers.1])。温度が direction 方向に temp を
# 「またいだ瞬間」に1回だけ発火します。id は同じ id を持つ [actions.<id>] とひも付きます
# （トリガーIDとアクションIDが対応）。
[triggers.1]
direction = "up"    # "up" = 上昇してtempを超えた, "down" = 下降してtemp以下になった
temp = 25.5

# アクション: id をキーにした辞書(例: [actions.1])。トリガーが発火したときに実行する内容。
# plugin ごとに payload の意味は異なります。
[actions.1]
plugin = "switchbot-aircon"
payload = "23,cool,3,on"   # switchbot-aircon プラグインの場合は "{temperature},{mode},{fanSpeed},{power}"

# プラグインごとの共通設定（プラグイン名 = 設定テーブル）
[plugins.switchbot-aircon]
base_url = "http://127.0.0.1:10510"
```

トリガーは `[triggers.<id>]` を追加するだけで何個でも作成できます。対応する `[actions.<id>]`
（同じ `id`）を用意すれば、トリガーごとに異なるプラグイン・異なる内容を実行できます。

### HTTP のタイムアウトとリトライ

プラグインが行うすべての HTTP リクエスト(SwitchBot API、switchbot-aircon)にはタイムアウトとリトライがあります。ネットワークエラー、タイムアウト、HTTP 429 / 5xx の場合に再試行し、待ち時間は毎回 2 倍になります(最大 30 秒。`Retry-After` があればそれに従います)。トークン間違いなどの 4xx は再試行しません。トリガーは「またいだ瞬間」に 1 回しか発火しないため、一時的な失敗でアクションが失われないようにするための仕組みです。

```toml
[http]                      # すべて省略可。値は既定値
retries = 3                 # 最初の試行のあとの再試行回数 (0 = 再試行しない)
timeout_seconds = 10        # 1 回の試行のタイムアウト
retry_delay_seconds = 1     # 最初の再試行までの待ち時間
```

### 起動時の最低/最高temp実行について

例えばトリガーが `up 25.5` / `down 25` / `down 24` / `up 24.5` の4つある場合、全トリガーの中の
最低temp(24)・最高temp(25.5)が対象になります。起動時の温度がすでに24以下なら id=3
（`down 24`）のアクションを、25.5以上なら id=1（`up 25.5`)のアクションを即座に実行します
（`fire_below_min` / `fire_above_max` でそれぞれ無効化可能）。それ以外のトリガー（この例では
`down 25` と `up 24.5`）は、通常どおり実際に温度がまたいだときにのみ発火します。

### 起動時のカスタムアクションについて

`[startup.custom_action]` を有効にすると、上記の `fire_below_min` / `fire_above_max` の
アクションが発火しない温度で起動したときに、指定したアクションを起動時に1回だけ実行します。
条件は `fire_below_min` / `fire_above_max` の有効・無効に応じて次のように決まります。

- 両方 `true`: 室温が「最低temp」より大きく「最高temp」より小さいときに実行
  （例: 最低24・最高25.5なら、24 < 室温 < 25.5 のときのみ実行）
- 両方 `false`: 室温に関わらず常に実行
- 片方だけ `true`: 有効な側の条件のみを適用（もう片方は制約なし）
  例えば `fire_below_min = true` / `fire_above_max = false` なら「室温 > 最低temp」であれば実行
  （上限は問わない）

つまり、`fire_below_min` / `fire_above_max` で対応済みの極端な温度域以外を、このカスタム
アクションで一括してカバーする形になります。

## ライセンス

MIT
