# Lịch rảnh nhóm bạn

Trang web tĩnh (HTML/CSS/JS thuần, không cần cài đặt) giúp một nhóm bạn đánh dấu lịch rảnh riêng của từng người, tổng hợp lại và gợi ý những buổi phù hợp để cả nhóm họp mặt.

Hỗ trợ hai chế độ:

- **Offline** (mặc định): lưu trong `localStorage` của từng máy.
- **Đồng bộ nhóm** (tuỳ chọn): dùng Supabase để mọi người cùng thấy một bản lịch, cập nhật thời gian thực. Xem mục [Thiết lập đồng bộ](#thiết-lập-đồng-bộ-supabase).

## Cách dùng

Mở `index.html` bằng trình duyệt. Dữ liệu tự động lưu trong `localStorage` của trình duyệt đó.

1. **Thêm thành viên**: nhấn “＋ Thêm thành viên”, nhập tên và chọn màu đại diện. Mỗi thành viên có một cuốn lịch riêng; chọn thành viên bằng cách nhấn vào chip tên của họ.
2. **Đánh dấu lịch rảnh**: với tuần đang xem, tích vào các buổi **Sáng / Chiều / Tối** của từng ngày. Mỗi ngày có ô **ghi chú khung giờ cụ thể** (ví dụ `9h00–11h00` hoặc `sau 20h`).
3. **Chuyển tuần**: dùng các nút `‹` / `›` hoặc “Về tuần hiện tại”.
4. **Xem tổng hợp**: bảng “Bảng tổng hợp cả nhóm” cho thấy số người rảnh trong từng buổi (màu càng đậm càng nhiều người rảnh, có thể di chuột để xem tên).
5. **Xem gợi ý**: cột bên phải xếp hạng các buổi theo số thành viên rảnh, kèm danh sách tên và ghi chú khung giờ của từng người. Dùng ô “Yêu cầu ít nhất” để lọc (mặc định là tất cả thành viên).
6. **Chốt lịch**: nhấn “Chọn thời điểm này” ở một gợi ý để lưu lại; phần “Lịch họp đã chọn” sẽ hiển thị chi tiết.

## Tiện ích khác

- **Dữ liệu mẫu**: tạo 4 thành viên với lịch rảnh mẫu để xem thử (có 4 buổi mà cả nhóm đều rảnh).
- **Xuất / Nhập JSON**: sao lưu hoặc chuyển dữ liệu sang máy khác.
- **Xóa tất cả**: xoá toàn bộ thành viên và lịch rảnh.
- Các nút “Chọn cả tuần” / “Xóa tuần này” áp dụng cho thành viên đang được chọn.

## Thiết lập đồng bộ (Supabase)

Cho phép các thành viên ở **khác máy / khác trình duyệt** cùng thấy một bản lịch. Khi một người tích buổi rảnh hoặc ghi chú, mọi người khác sẽ thấy sau ~1 giây.

### 1. Tạo project Supabase

1. Đăng ký miễn phí tại **https://supabase.com** → **New project** (chọn region gần nhất, đặt mật khẩu DB).
2. Vào **Project Settings → API**, lấy:
   - **Project URL**
   - **anon public** key (không dùng `service_role` key!)
3. Dán 2 giá trị đó vào `config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

### 2. Tạo bảng dữ liệu

Vào **SQL Editor** trong Supabase, dán và chạy toàn bộ đoạn sau:

```sql
-- Bảng lưu mỗi "phòng" nhóm
create table if not exists public.groups (
  code text primary key,
  data jsonb not null,
  writer text,
  updated_at timestamptz not null default now()
);

alter table public.groups enable row level security;

-- Cấp quyền ở cấp bảng cho role anon/authenticated (bắt buộc, RLS chưa đủ)
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.groups to anon, authenticated;

-- Cho phép đọc/ghi ở mức anon (bảo vệ bằng mã nhóm ngẫu nhiên)
drop policy if exists "group_select" on public.groups;
create policy "group_select" on public.groups
  for select to anon, authenticated using (true);

drop policy if exists "group_insert" on public.groups;
create policy "group_insert" on public.groups
  for insert to anon, authenticated with check (true);

drop policy if exists "group_update" on public.groups;
create policy "group_update" on public.groups
  for update to anon, authenticated using (true) with check (true);

-- Bật realtime cho bảng này
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
end $$;
```

### 3. Deploy và dùng

- Deploy lại trang web (có `config.js` mới).
- Trên máy đầu tiên: nhấn **Tạo nhóm mới** → app phát mã 8 ký tự (VD `A7K2M9QX`).
- Nhấn **📋 Sao chép**, gửi mã cho bạn bè.
- Trên máy bạn bè: nhập mã vào ô **Mã nhóm** → **Tham gia**. Họ sẽ thấy ngay lịch hiện tại.
- Mã nhóm được lưu trong trình duyệt, nên lần sau mở lại tự động vào lại nhóm.

### Lưu ý về bảo mật & giới hạn

- Ai có **mã nhóm** đều đọc/ghi được dữ liệu nhóm đó. Mã là chuỗi ngẫu nhiên 8 ký tự nên đủ khó đoán với nhóm bạn, nhưng **không nên dùng cho dữ liệu nhạy cảm**.
- Đây là mô hình **ghi đè lần cuối** (last-write-wins): nếu hai người sửa cùng một lúc, thay đổi gửi sau sẽ thắng. Với lịch rảnh của nhóm nhỏ thì thường không gây vấn đề.
- Supabase free tier có giới hạn và **tạm dừng project sau ~1 tuần không hoạt động**; khi đó bạn vào dashboard bấm Restore là dùng lại.
- Nếu bỏ trống 2 chuỗi trong `config.js`, app tự động quay về chế độ offline, không ảnh hưởng gì.

## Cách hoạt động của gợi ý

Với mỗi ngày trong tuần đang xem và mỗi buổi (sáng/chiều/tối), ứng dụng đếm số thành viên đã đánh dấu rảnh. Các buổi có số người rảnh bằng hoặc vượt ngưỡng “Yêu cầu ít nhất” được sắp xếp theo:

1. Số thành viên rảnh giảm dần;
2. Ngày sớm hơn;
3. Buổi sáng → chiều → tối.

Gợi ý đầu tiên được đánh dấu là tốt nhất. Ghi chú của từng người được hiển thị kèm theo để bạn dễ chọn được khung giờ cụ thể mà nhiều người trùng nhau.
