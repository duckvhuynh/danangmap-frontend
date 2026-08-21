import Link from "next/link";
import { IconFileImport, IconMailPlus, IconPlus, IconSearch, IconUsers } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const users = [
  { name: "Nguyễn Văn An", email: "an.nguyen@danang.gov.vn", role: "Editor", status: "Hoạt động" },
  { name: "Trần Thị Minh", email: "minh.tran@danang.gov.vn", role: "Reviewer", status: "Hoạt động" },
  { name: "Lê Quốc Hải", email: "hai.le@danang.gov.vn", role: "Publisher", status: "Đã mời" },
];

export default function UsersPage() { return <main className="mx-auto max-w-[1200px] p-4 pb-24 sm:p-6 md:p-8"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Quản trị truy cập</p><h1 className="mt-1 text-2xl font-semibold">Người dùng nội bộ</h1><p className="mt-2 text-sm text-muted-foreground">Tạo thủ công, gửi lời mời hoặc import tài khoản theo danh sách.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/users/import"><IconFileImport stroke={1.75}/>Import</Link></Button><Button disabled title="Invite API chưa được kết nối" variant="outline"><IconMailPlus stroke={1.75}/>Mời</Button><Button disabled title="User create API chưa được kết nối"><IconPlus stroke={1.75}/>Tạo tài khoản</Button></div></header><section className="mt-7 overflow-hidden rounded-panel border bg-surface"><div className="relative border-b p-4"><IconSearch className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" size={19}/><Input disabled title="User catalog API chưa được kết nối" className="max-w-md pl-10" placeholder="Tìm tên hoặc email..."/></div><div className="divide-y">{users.map((user) => <article key={user.email} className="flex flex-wrap items-center gap-4 p-4"><span className="grid size-10 place-items-center rounded-full bg-accent-subtle text-primary"><IconUsers size={20} stroke={1.75}/></span><div className="min-w-[220px] flex-1"><h2 className="text-sm font-medium">{user.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p></div><Badge>{user.role}</Badge><span className="w-24 text-sm text-muted-foreground">{user.status}</span><Button disabled title="User detail API chưa được kết nối" variant="ghost" size="sm">Chi tiết</Button></article>)}</div></section></main>; }
