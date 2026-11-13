# Deadline Tracker

Dashboard cục bộ theo dõi hạn CITD-Elearning và Jira. Windows Task Scheduler chạy đồng bộ mỗi ngày lúc 22:30; nút trên dashboard cũng có thể chạy đồng bộ ngay trên máy.

Yêu cầu Node.js 26 trở lên.

## Bảo mật

- Không đặt GitHub PAT, Jira token hoặc URL lịch có authtoken trong mã nguồn hay frontend.
- Tất cả thông tin xác thực chỉ nằm trong `.env` cục bộ (đã được ignore) và được gửi từ máy này tới dịch vụ tương ứng.
- Dùng Private GitHub repository. Secret Gist chỉ là unlisted, không thật sự riêng tư; dashboard này lưu dữ liệu trong file `data/deadlines.json` của repository riêng tư và không phát hành ra GitHub Pages.
- Nếu token bị lộ, hãy thu hồi và tạo token mới trước khi kết nối. Không lưu `.env` trong repository.

## Tạo repository và chạy dashboard cục bộ

1. Tạo một Private GitHub repository riêng cho tracker. Đẩy nội dung bên trong thư mục `deadline-tracker` lên gốc repository.
2. File dữ liệu đã có sẵn tại `data/deadlines.json`; không cần tạo Gist.
3. Tạo fine-grained personal access token chỉ cấp cho repository này, với quyền **Contents: Read and write**. Không cần quyền Actions.
4. Sao chép `.env.example` thành `.env` tại gốc repository, điền các giá trị GitHub, CITD và Jira. Không điền token trong giao diện web.
5. Chạy `npm start` trong thư mục repository, rồi mở URL máy chủ in ra trong terminal (thường là `http://127.0.0.1:4173`). Nếu cổng mặc định đang được sử dụng, máy chủ tự chọn cổng khả dụng khác.

Máy chủ chỉ bind vào loopback `127.0.0.1`. Token cục bộ chỉ được gửi từ máy chủ tới GitHub API, không được gửi xuống trình duyệt.

## Lên lịch trên Windows

1. Cài Node.js 26 trở lên. Trong PowerShell, chạy `where.exe node` để tìm đường dẫn `node.exe`.
2. Mở **Task Scheduler → Create Task**.
3. Trong **Triggers**, tạo lịch **Daily** lúc **22:30**.
4. Trong **Actions**, chọn **Start a program**:
   - **Program/script**: đường dẫn `node.exe` từ bước 1.
   - **Add arguments**: `src\sync.js`
   - **Start in**: đường dẫn thư mục repository tracker.
5. Lưu task, bấm chuột phải vào task và chọn **Run** để thử đồng bộ ngay.

Nút **Quét dữ liệu ngay** chạy cùng worker cục bộ. Sau khi worker cập nhật file trong Private repository, dashboard đọc dữ liệu mới từ repository đó.

Không cần cấu hình GitHub Actions Secrets hoặc workflow để đồng bộ. Có thể xóa các Actions secrets cũ sau khi đã chuyển các giá trị đã tạo mới vào `.env`.

Jira trả trạng thái hoàn thành qua `resolutiondate`. Hạn Jira kiểu ngày được hiểu là 23:59:59 theo `Asia/Ho_Chi_Minh`. Moodle iCalendar không cho biết trạng thái nộp bài, nên dashboard cho phép đánh dấu thủ công và đồng bộ sẽ giữ trạng thái này qua các lần quét.

Tên môn và giảng viên CITD được ánh xạ theo mã lớp trong `src/core.js`. Mã chưa có trong danh sách vẫn hiển thị như dữ liệu iCalendar.

## Kiểm tra

Chạy `npm test` trong thư mục `deadline-tracker`.
