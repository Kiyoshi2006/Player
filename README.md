# MKV Cloudflare Player

Player web tối ưu cho iPhone/Safari để mở MKV/HEVC từ URL HTTP(S), dùng Cloudflare Worker làm Range/CORS proxy và Movi Player chạy phía trình duyệt.

## Tính năng

- Không upload video lên Cloudflare.
- Không transcode 4K trên Worker.
- Proxy `GET`/`HEAD` và HTTP Range.
- CORS cho player.
- Tự phát hiện audio/subtitle tracks từ container MKV thông qua Movi Player.
- Không hard-code ngôn ngữ subtitle.
- Hỗ trợ URL trực tiếp và URL query `?url=...`.
- Có endpoint kiểm tra Range.
- Giao diện responsive cho iPhone.

## Kiến trúc

```text
iPhone / Safari
      |
      v
Cloudflare Worker
  /proxy?url=...
      |
      v
MKV origin
      |
      v
Movi Player + WebAssembly + WebCodecs
```

Worker không giữ toàn bộ file trong RAM. Cloudflare Workers hỗ trợ streaming response và không áp giới hạn kích thước response body; Free plan hiện có 128 MB memory và 100.000 requests/ngày. Xem tài liệu Cloudflare để kiểm tra giới hạn hiện hành.

## Quan trọng về ALLOWED_HOSTS

Worker có allowlist host để tránh biến deployment thành open proxy.

Mặc định cho sẵn:

```text
loli.nvnyep.workers.dev
```

Nếu muốn dùng nguồn khác, tạo biến môi trường Worker:

```text
ALLOWED_HOSTS=example.com,another.example
```

Các subdomain của host đã cho phép cũng được chấp nhận.

## Deploy

### Cách 1 — GitHub + Cloudflare Dashboard

1. Tạo repository GitHub.
2. Upload toàn bộ project này.
3. Trong Cloudflare mở Workers & Pages.
4. Chọn Create / Import existing project từ GitHub.
5. Chọn repository.
6. Deploy theo cấu hình `wrangler.jsonc`.

Nếu dashboard yêu cầu build command, project này không cần bước build frontend. Wrangler chỉ cần deploy static assets + Worker.

### Cách 2 — Wrangler

Cần Node.js.

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## URL

Sau deploy:

```text
https://<worker-name>.<your-subdomain>.workers.dev/
```

Có thể mở thẳng:

```text
https://<worker-name>.<your-subdomain>.workers.dev/?url=<ENCODED_MKV_URL>
```

## Kiểm tra Range

Mở:

```text
/api/probe?url=<ENCODED_MKV_URL>
```

Kết quả tốt nhất là:

```json
{
  "ok": true,
  "status": 206,
  "acceptRanges": "bytes"
}
```

`206 Partial Content` là trạng thái lý tưởng cho seeking/streaming file lớn.

## Giới hạn thực tế

- Safari/iOS phải hỗ trợ decoder phù hợp cho codec của file.
- MKV/HEVC không được `<video>` native xử lý như MP4; Movi Player dùng WebAssembly/WebCodecs để xử lý container/codec.
- 2160p HEVC có thể rất nặng trên iPhone đời cũ.
- Network chậm hoặc origin không hỗ trợ Range sẽ ảnh hưởng seeking.
- Worker Free có giới hạn request/CPU/memory. Worker này không decode/transcode video.

## Nguồn player

Project sử dụng Movi Player 0.4.0, một thư viện Apache-2.0 hỗ trợ MKV, HEVC, multi-audio và subtitle tracks phía browser.

Nếu bạn phân phối lại build/player, giữ thông tin license của dependency theo điều khoản của dependency.

## Security

Không biến `/proxy` thành open proxy nếu bạn public Worker. Hãy đặt `ALLOWED_HOSTS` thành các host video mà bạn thực sự sử dụng.

Nếu cần nhiều host, phân cách bằng dấu phẩy:

```text
ALLOWED_HOSTS=loli.nvnyep.workers.dev,cdn.example.com,media.example.net
```
