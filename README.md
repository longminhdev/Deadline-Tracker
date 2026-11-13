# Deadline Tracker

Dashboard cục bộ theo dõi hạn CITD-Elearning và Jira. GitHub Actions lấy dữ liệu mỗi ngày lúc 22:30 giờ Việt Nam, giữ trạng thái đã nộp trong file thuộc Private GitHub repository và có thể chạy thủ công từ dashboard.

## Bảo mật

- Không đặt GitHub PAT, Jira token hoặc URL lịch có authtoken trong mã nguồn hay frontend.
- `GH_PAT` chỉ được dùng phía server cục bộ và trong GitHub Actions Secrets. Tạo `.env` từ `.env.example`; file `.env` đã được ignore.
- Dùng Private GitHub repository. Secret Gist chỉ là unlisted, không thật sự riêng tư; dashboard này lưu dữ liệu trong file `data/deadlines.json` của repository riêng tư và không phát hành ra GitHub Pages.
- Nếu token bị lộ, hãy thu hồi và tạo token mới trước khi kết nối.

## Tạo repository và chạy dashboard cục bộ

1. Tạo một Private GitHub repository riêng cho tracker. Đẩy nội dung bên trong thư mục `deadline-tracker` lên gốc repository; workflow nằm ở `.github/workflows/deadline-sync.yml`.
2. File dữ liệu đã có sẵn tại `data/deadlines.json`; không cần tạo Gist.
3. Tạo fine-grained personal access token chỉ cấp cho repository này, với quyền **Contents: Read and write** và **Actions: Read and write**. Không gửi token qua chat.
4. Sao chép `.env.example` thành `.env` tại gốc repository, điền `GH_PAT` và `GITHUB_REPOSITORY` (`owner/repository`). Không điền token trong giao diện web.
5. Chạy `npm start` trong thư mục repository, rồi mở `http://127.0.0.1:4173`.

Máy chủ chỉ bind vào loopback `127.0.0.1`. Token cục bộ chỉ được gửi từ máy chủ tới GitHub API, không được gửi xuống trình duyệt.

## Cấu hình GitHub Actions

Thêm các Actions secrets trong **Settings → Secrets and variables → Actions** của repository tracker:

- `CITD_ICS_URL`: link iCalendar HTTPS của Moodle; lưu riêng trong Secrets vì có thể chứa authtoken.
- `JIRA_DOMAIN`: hostname Jira, ví dụ `company.atlassian.net`.
- `JIRA_EMAIL`, `JIRA_API_TOKEN`.
- `GH_PAT`: cùng fine-grained token, có quyền **Contents: Read and write** và **Actions: Read and write** trên repository tracker.

Cron `30 15 * * *` là 15:30 UTC, tương đương 22:30 tại Việt Nam; GitHub có thể bắt đầu workflow trễ hơn giờ đã đặt. `workflow_dispatch` hỗ trợ nút quét từ dashboard.

Jira trả trạng thái hoàn thành qua `resolutiondate`. Hạn Jira kiểu ngày được hiểu là 23:59:59 theo `Asia/Ho_Chi_Minh`. Moodle iCalendar không cho biết trạng thái nộp bài, nên dashboard cho phép đánh dấu thủ công và đồng bộ sẽ giữ trạng thái này qua các lần quét.

## Kiểm tra

Chạy `npm test` trong thư mục `deadline-tracker`.
