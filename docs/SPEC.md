# room-temp-automator 仕様書

センサーの値(部屋の温度)を一定の間隔で取得し、あらかじめ決めたしきい値を「またいだ」瞬間に、トリガーごとに決めたアクションを実行する常駐ツール。Bun + TypeScript。単体実行ファイルとして配る。

この文書は動作の決まり(コードの正)。変えたら同じ PR でこの文書も直す。

## 構成

| 場所 | 役割 |
|---|---|
| `src/index.ts` | コマンドの振り分け |
| `src/config.ts` | `config.toml` の読み込みと検証 |
| `src/engine.ts` | 取得ループ、またぎの判定、起動時の処理、アクションの実行 |
| `src/http.ts` | タイムアウトとリトライ付きの `fetch`(`fetchWithRetry`) |
| `src/list-devices.ts` | SwitchBot のデバイス一覧 |
| `src/plugins/sensors/` | センサープラグイン(`switchbot-hub`) |
| `src/plugins/actions/` | アクションプラグイン(`switchbot-aircon`) |
| `src/types.ts` | 型 |

## コマンド

| コマンド | 動作 |
|---|---|
| (なし) | 常駐して温度を取得し、アクションを実行する |
| `list-devices` | SwitchBot のデバイスを一覧する(`[sensor.config].device_id` を調べる用) |
| `help` / `--help` / `-h` | 使い方を出す |

- オプション `-c` / `--config <パス>`: 設定ファイルを指定する。なければカレントディレクトリの `config.toml`。パスが無ければエラー。
- 最初の引数が `-` で始まるオプション(`help` 系を除く)なら、コマンドなし(常駐)として扱う。
- 知らないコマンドは使い方を出して終了コード 1。
- 設定は `config.toml` だけを読み、環境変数や `.env` は使わない。ファイルがなければ `Config file not found` で終了する。

## 設定 `config.toml`

| テーブル | 内容 |
|---|---|
| `[http]` | 省略可。`retries`(既定 3、0 以上の整数)、`timeout_seconds`(既定 10、0.1 以上)、`retry_delay_seconds`(既定 1、0 以上)。不正な値はエラー |
| `[sensor]` | 必須。`plugin`(センサープラグイン名、文字列)、`poll_interval_seconds`(既定 60)。 |
| `[sensor.config]` | センサープラグインごとの設定(プラグインが解釈する) |
| `[startup]` | `fire_below_min`(既定 true)、`fire_above_max`(既定 true) |
| `[startup.custom_action]` | `enabled`(既定 false)、`plugin`、`payload`。`enabled` なのにどちらかが空ならエラー |
| `[triggers.<id>]` | 1 つ以上必須。`direction`(`"up"` か `"down"`)、`temp`(数値)。キーは数値の id |
| `[actions.<id>]` | 1 つ以上必須。`plugin`、`payload`(どちらも文字列)。キーは数値の id |
| `[plugins.<名前>]` | アクションプラグインごとの共通設定 |

- すべてのトリガーに、同じ id のアクションがなければエラー(トリガーの id とアクションの id が対応する)。
- 使うプラグイン名(センサー、アクション、起動時のカスタムアクション)が登録されていなければ、起動時に使えるプラグインの一覧つきでエラー。
- `config.toml` には認証情報が入る。リポジトリに入れない(`.gitignore` で除外する)。

## 動作

### 取得ループ

1. 起動時に 1 回、温度を取得する(前回の値として保持)。失敗してもログに出して続ける(前回の値は無し)。
2. 取得できていれば、起動時の処理(下)を行う。
3. 以降、`poll_interval_seconds` ごとに取得する。取得に失敗したらログに出して、前回の値はそのままで次の周期を待つ。
4. 前回の値があれば、すべてのトリガーについて「またいだか」を判定し、またいだトリガーのアクションを実行する。その後、前回の値を今回の値に更新する。

### またぎの判定(1 回だけ発火する)

- `up`: 前回 < `temp` かつ 今回 >= `temp`
- `down`: 前回 > `temp` かつ 今回 <= `temp`

しきい値の上にいる間は何度取得しても発火しない(またいだ瞬間の 1 回だけ)。

### 起動時の処理

起動直後は値が 1 つしかなく「またぎ」を判定できないため、次を行う(いずれも最初の 1 回の取得が成功したときだけ)。

- `fire_below_min` が有効で、温度が全トリガーの最低 `temp` 以下なら、その最低 `temp` を持つすべてのトリガーのアクションを実行する。
- `fire_above_max` が有効で、温度が全トリガーの最高 `temp` 以上なら、その最高 `temp` を持つすべてのトリガーのアクションを実行する。
- `startup.custom_action` が有効なら、次の条件のときに 1 回実行する。
  - 下側(`fire_below_min` が有効): 温度 > 最低 `temp`。無効なら制約なし。
  - 上側(`fire_above_max` が有効): 温度 < 最高 `temp`。無効なら制約なし。
  - 両方の条件を満たしたときに実行。両方無効なら常に実行。

### アクションの実行

- トリガーが発火すると、同じ id のアクションの `plugin` を `payload` と `[plugins.<plugin>]` の設定で呼ぶ。
- アクションの失敗はログに出すだけで、ループは止まらない。
- 実行したことと失敗は、`[INFO]` / `[ERROR]` でログに出す(起動時の実行は理由つき)。

## HTTP(`fetchWithRetry`)

プラグインのすべての HTTP リクエストが通る。1 回ごとにタイムアウトを付ける。

- 再試行する: ネットワークエラー、タイムアウト、HTTP 429 と 5xx。待ち時間は `retry_delay_seconds` から始まり毎回 2 倍(最大 30 秒)。`Retry-After` があればそれに従う(最大 30 秒)。
- 再試行しない: それ以外の 4xx(トークン間違いなどは再試行しても直らない)。
- 最後の試行で失敗したら、応答はそのまま返し(呼び出し側がエラーにする)、ネットワークエラーは投げる。
- リクエストを引数の関数で作ると、試行ごとに新しい値になる(署名つきリクエストの timestamp と nonce)。

## プラグイン

プラグインは静的 import でレジストリ(各ディレクトリの `index.ts`)に登録する。`bun build --compile` で実行ファイルに自動で同梱される。

### センサー `switchbot-hub`

SwitchBot Cloud API v1.1 の `GET https://api.switch-bot.com/v1.1/devices/{device_id}/status` で温度(`body.temperature`)を取得する。`[sensor.config]` の `token`、`secret`、`device_id` が必須(なければエラー)。

- 署名: `HMAC-SHA256(secret, token + t + nonce)` を base64 にして、ヘッダー `Authorization`(token)、`sign`、`t`(ミリ秒の時刻)、`nonce`(UUID)に入れる。試行ごとに作り直す。
- HTTP のエラー、`statusCode` が 100 でない、または温度がなければエラー。

### アクション `switchbot-aircon`

[switchbot-aircon](https://github.com/NaeCqde/switchbot-aircon) の HTTP API に `POST {base_url}/parameter/{payload}` を送る。`payload` は `温度,モード,風量,電源`(例 `23,cool,3,on`)でそのまま渡す。

- `base_url` は `[plugins.switchbot-aircon]`(既定 `http://127.0.0.1:10510`。末尾の `/` は除く)。
- 応答が 2xx でなければ、ステータスと本文つきでエラー。

### プラグインの追加

`src/plugins/sensors/` または `src/plugins/actions/` に実装し、同ディレクトリの `index.ts` に登録する。センサーは `getTemperature(config): Promise<number>`、アクションは `execute(payload, config): Promise<void>`。

## `list-devices`

`config.toml` の `[sensor.config]` の `token` と `secret` で `GET https://api.switch-bot.com/v1.1/devices` を呼び、デバイスを一覧する。`token` か `secret` がなければメッセージを出して終了コード 1。

## ビルドとリリース

- `bun run build` で単体実行ファイルを作る(Bun のランタイムを同梱)。
- Releases の対象: Windows x86_64、macOS aarch64、Linux x86_64 / aarch64(musl)。各実行ファイルに `.sha256` と、`config.example.toml` が付く。

## セキュリティ上の注意

- `token` と `secret` は `config.toml` に平文で入る。ファイルの権限と、リポジトリに入れないことを守る。
- SwitchBot の API への通信は HTTPS。`switchbot-aircon` への通信は設定した `base_url` のとおり(既定は同じ機械の HTTP)で、別の機械に置くなら信頼できるネットワークに限る。
- 値がしきい値をまたぐのは 1 回だけなので、そのときに通信が失敗するとアクションが失われうる。そのため HTTP にはリトライがある。リトライしても失敗した分は再実行されない(次にまたぐまで)。
