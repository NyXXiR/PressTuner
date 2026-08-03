"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMeStore } from "@/stores/useMeStore";
import { z } from "zod"; // zod import
import { validate, V } from "@/lib/utils/validate"; // ✅ V import
import {
  Users,
  UserPlus,
  RefreshCw,
  Mail,
  ShieldCheck,
  Trash2,
  ArrowRightLeft,
  LogOut,
  Search,
  MessageSquare,
  X,
  Info,
} from "lucide-react";

import {
  TEAM_ROLE_META,
  TEAM_ROLES_LIST,
  TeamRole,
} from "@/lib/constants/team-roles";

// --- [수정] V를 사용한 검증 스키마 ---
const InviteSchema = z.object({
  // V.maxLen을 사용하여 메시지 자동 생성 ("검색어은(는) 최대 50자까지...")
  query: V.maxLen("검색어", 50),
  message: V.maxLen("초대 메시지", 200),
});

// --- Types ---
type MemberRow = {
  userId: string;
  role: TeamRole;
  joinedAt: string;
  user: {
    id: string;
    loginId: string;
    label: string;
    email?: string | null;
    avatarUrl?: string | null;
    createdAt: string;
  };
};

type UserSuggestion = {
  id: string;
  loginId: string;
  label: string;
  email?: string | null;
  avatarUrl?: string | null;
  alreadyMember: boolean;
  alreadyInvited: boolean;
};

type OutboxInvitation = {
  id: string;
  createdAt: string;
  message?: string | null;
  inviteeUserId?: string | null;
  inviteeLabel?: string | null;
  inviter: { id: string; label: string };
  invitee?: {
    id: string;
    label: string;
    loginId: string;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
};

// --- Helpers ---
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isAdminOrOwner(role: TeamRole | string | null | undefined) {
  return role === "OWNER" || role === "ADMIN";
}

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return s;
  }
}

function Avatar({
  avatarUrl,
  alt,
  size = "md",
}: {
  avatarUrl?: string | null;
  alt: string;
  size?: "sm" | "md";
}) {
  const sizeMap = { sm: "h-6 w-6 text-[8px]", md: "h-9 w-9 text-[10px]" };
  return (
    <div
      className={cx(
        sizeMap[size],
        "shrink-0 rounded-full border border-border bg-muted/50 overflow-hidden flex items-center justify-center",
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="opacity-50">👤</span>
      )}
    </div>
  );
}

export default function TeamPage() {
  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetchMe);

  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<TeamRole | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const canManage = useMemo(() => isAdminOrOwner(myRole), [myRole]);
  const isOwner = useMemo(() => myRole === "OWNER", [myRole]);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);

  // --- [추가] 에러 상태 ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [outbox, setOutbox] = useState<OutboxInvitation[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);

  const SUGGESTION_LIMIT = 8;
  const [hasSearched, setHasSearched] = useState(false);

  const refreshMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/members", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setMembers([]);
        setTeamId(null);
        setMyRole(null);
        return;
      }
      setTeamId(data.teamId ?? null);
      setMyRole(data.myRole ?? null);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOutbox = useCallback(async () => {
    setOutboxLoading(true);
    try {
      const res = await fetch("/api/team/invitations/outbox", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok)
        setOutbox(Array.isArray(data.invitations) ? data.invitations : []);
    } finally {
      setOutboxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!me) fetchMe();
    refreshMembers();
    refreshOutbox();
  }, [fetchMe, me, refreshMembers, refreshOutbox]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setHasSearched(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSuggestions([]);
        setHasSearched(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!canManage) return;

    if (
      selectedUser &&
      query !== selectedUser.label &&
      query !== selectedUser.loginId
    ) {
      setSelectedUser(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ac = new AbortController();
      searchAbortRef.current = ac;

      setSearching(true);
      setHasSearched(true);

      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          {
            cache: "no-store",
            signal: ac.signal,
          },
        );
        const data = await res.json().catch(() => null);

        if (res.ok && data?.ok) {
          const users = Array.isArray(data.users) ? data.users : [];
          setSuggestions(users.slice(0, SUGGESTION_LIMIT));
        } else {
          setSuggestions([]);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, [query, canManage, selectedUser]);

  const sendInvitation = useCallback(async () => {
    if (
      !selectedUser ||
      selectedUser.alreadyMember ||
      selectedUser.alreadyInvited
    )
      return;

    // --- [수정] V를 활용한 검증 로직 ---
    const { success, errors: validationErrors } = validate(InviteSchema, {
      query: query,
      message: inviteMessage,
    });

    if (!success && validationErrors) {
      // 에러가 있으면 첫 번째 에러 메시지 표시
      alert(Object.values(validationErrors)[0]);
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeUserId: selectedUser.id,
          message: inviteMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setQuery("");
        setSelectedUser(null);
        setInviteMessage("");
        setSuggestions([]);
        setHasSearched(false);
        await refreshOutbox();
      } else {
        alert(data?.message ?? data?.error ?? "초대 실패");
      }
    } finally {
      setInviting(false);
    }
  }, [inviteMessage, query, refreshOutbox, selectedUser]);

  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!confirm("초대를 취소할까요?")) return;
      try {
        const res = await fetch(`/api/team/invitations/${invitationId}`, {
          method: "DELETE",
        });
        if (res.ok) await refreshOutbox();
      } catch (e) {
        alert("오류 발생");
      }
    },
    [refreshOutbox],
  );

  const changeRole = useCallback(
    async (userId: string, role: Exclude<TeamRole, "OWNER">) => {
      try {
        const res = await fetch(`/api/team/members/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (res.ok) await refreshMembers();
      } catch (e) {
        alert("변경 실패");
      }
    },
    [refreshMembers],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      const isSelf = userId === me?.userId;

      if (isSelf && myRole === "OWNER") {
        alert(
          "팀 소유자(OWNER)는 팀을 탈퇴할 수 없습니다.\n먼저 소유권을 다른 멤버에게 이전해주세요.",
        );
        return;
      }

      if (!confirm(isSelf ? "팀에서 탈퇴할까요?" : "멤버를 내보낼까요?"))
        return;
      try {
        const res = await fetch(`/api/team/members/${userId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await refreshMembers();
          await fetchMe();
        }
      } catch (e) {
        alert("실패");
      }
    },
    [fetchMe, me?.userId, refreshMembers, myRole],
  );

  const transferOwnership = useCallback(
    async (targetUserId: string) => {
      if (!confirm("소유권을 이전할까요? 내 권한은 ADMIN이 됩니다.")) return;
      try {
        const res = await fetch("/api/team/ownership/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        if (res.ok) {
          await refreshMembers();
          await fetchMe();
        }
      } catch (e) {
        alert("이전 실패");
      }
    },
    [fetchMe, refreshMembers],
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl font-display">
            멤버 관리
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-[11px] uppercase tracking-wider">
              {myRole ?? "Guest"}
            </span>
            <span>•</span>
            <span>{members.length}명의 팀 멤버</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refreshMembers();
              refreshOutbox();
            }}
            className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-background px-4 text-sm font-medium transition-all hover:bg-muted"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
          <Link
            href="/my/notifications"
            className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-background px-4 text-sm font-medium transition-all hover:bg-muted"
          >
            <Mail size={14} />내 초대함
          </Link>
        </div>
      </header>

      {/* Invite Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <UserPlus size={18} className="text-primary" />
          <h2 className="text-base font-semibold">멤버 초대</h2>
        </div>

        <div
          className="border border-border bg-card p-6 relative"
          ref={boxRef}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Search Input */}
            <div className="lg:col-span-4 relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <input
                className="h-11 w-full border border-border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
                placeholder="라벨 또는 아이디(loginId) 검색..."
                value={query}
                maxLength={50} // 1차 제한 (UI)
                onChange={(e) => setQuery(e.target.value)}
                disabled={!canManage || inviting}
              />

              {/* Suggestions Dropdown */}
              {canManage && (searching || hasSearched) && (
                <div className="absolute z-50 mt-2 w-full border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
                  {searching ? (
                    <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                      <RefreshCw size={12} className="animate-spin" /> 검색
                      중...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">
                      검색 결과가 없습니다.
                    </div>
                  ) : (
                    <>
                      <div className="max-h-60 overflow-y-auto py-2">
                        {suggestions.map((u) => {
                          const disabled = u.alreadyMember || u.alreadyInvited;
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                if (!disabled) {
                                  setSelectedUser(u);
                                  setQuery(u.label);
                                  setSuggestions([]);
                                  setHasSearched(false);
                                }
                              }}
                              className={cx(
                                "w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors",
                                disabled
                                  ? "opacity-40 cursor-not-allowed"
                                  : "hover:bg-muted/50",
                              )}
                            >
                              <Avatar avatarUrl={u.avatarUrl} alt={u.label} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate">
                                  {u.label}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {u.loginId} {u.alreadyMember && "• 이미 가입"}{" "}
                                  {u.alreadyInvited && "• 초대 중"}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="px-4 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground">
                        상위 {SUGGESTION_LIMIT}개만 표시됩니다. 더 정확한
                        키워드로 검색해 주세요.
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          {/* Message Input */}
            <div className="lg:col-span-6 relative">
              <MessageSquare
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={14}
              />
              <input
                // ✅ 수정됨: pr-4 -> pr-14 (글자 수 카운터 공간 확보)
                className="h-11 w-full border border-border bg-background pl-9 pr-14 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="초대 메시지를 입력하세요 (선택)"
                value={inviteMessage}
                maxLength={200}
                onChange={(e) => setInviteMessage(e.target.value)}
                disabled={!canManage || inviting}
              />
              {/* 카운터 위치는 그대로 유지 */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 pointer-events-none font-mono">
                {inviteMessage.length}/200
              </div>
            </div>

            {/* Action Button */}
            <div className="lg:col-span-2">
              <button
                onClick={sendInvitation}
                disabled={!canManage || inviting || !selectedUser}
                className="h-11 w-full bg-primary text-primary-foreground text-sm font-bold transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                초대 전송
              </button>
            </div>
          </div>

          {selectedUser && (
            <div className="mt-4 flex items-center gap-2 animate-in slide-in-from-left-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/20 bg-primary/5 text-xs font-semibold text-primary">
                {selectedUser.label} ({selectedUser.loginId})
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setQuery("");
                    setSuggestions([]);
                    setHasSearched(false);
                  }}
                  className="hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Invitations Outbox Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Mail size={18} className="text-muted-foreground" />
          <h2 className="text-base font-semibold">보낸 초대 현황</h2>
        </div>

        <div className="border border-border bg-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted/30 border-b border-border">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">대상</th>
                <th className="px-6 py-4 hidden md:table-cell">메시지</th>
                <th className="px-6 py-4 hidden lg:table-cell text-right">
                  보낸 시간
                </th>
                <th className="px-6 py-4 w-24 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outboxLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    불러오는 중...
                  </td>
                </tr>
              ) : outbox.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    대기 중인 초대가 없습니다.
                  </td>
                </tr>
              ) : (
                outbox.map((inv) => (
                  <tr
                    key={inv.id}
                    className="group hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {inv.invitee?.label ?? inv.inviteeLabel ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {inv.invitee?.loginId ?? inv.inviteeUserId}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground italic truncate max-w-xs">
                        {inv.message || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-right text-[11px] font-medium text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => cancelInvitation(inv.id)}
                        className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Members Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Users size={18} className="text-primary" />
          <h2 className="text-base font-semibold">멤버 목록</h2>
        </div>

        <div className="border border-border bg-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted/30 border-b border-border">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">사용자</th>
                <th className="px-6 py-4 hidden md:table-cell">계정</th>
                <th className="px-6 py-4">권한</th>
                <th className="px-6 py-4 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    데이터 로딩 중...
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isSelf = m.userId === me?.userId;
                  const isTargetOwner = m.role === "OWNER";

                  const isSelfOwner = isSelf && isOwner;
                  const isOwnerRow = m.role === "OWNER";

                  return (
                    <tr
                      key={m.userId}
                      className="group hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            avatarUrl={m.user.avatarUrl}
                            alt={m.user.label}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {m.user.label}{" "}
                              {isSelf && (
                                <span className="text-primary text-[10px] ml-1">
                                  (나)
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              ID: {m.userId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="text-xs text-foreground/80">
                          {m.user.loginId}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {m.user.email ?? "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {isOwnerRow ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary/20 bg-primary/10 text-primary text-[11px] font-bold">
                            <ShieldCheck size={12} /> OWNER
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              changeRole(
                                m.userId,
                                e.target.value as Exclude<TeamRole, "OWNER">,
                              )
                            }
                            disabled={!canManage}
                            className="h-8 border border-border bg-muted/30 px-2 text-[11px] font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
                          >
                            {TEAM_ROLES_LIST.filter(
                              (r) => r.role !== "OWNER",
                            ).map((r) => (
                              <option key={r.role} value={r.role}>
                                {r.role}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {!isSelf && isOwner && (
                            <button
                              onClick={() => transferOwnership(m.userId)}
                              className="p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-all"
                              title="소유권 이전"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => removeMember(m.userId)}
                            disabled={
                              isSelfOwner ||
                              (!isSelf && (!canManage || isTargetOwner))
                            }
                            className={cx(
                              "p-2 transition-all",
                              isSelf
                                ? isSelfOwner
                                  ? "text-muted-foreground opacity-30 cursor-not-allowed"
                                  : "text-red-500 hover:bg-red-50"
                                : "text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-30",
                            )}
                            title={
                              isSelf
                                ? isSelfOwner
                                  ? "소유자는 탈퇴할 수 없습니다 (권한 이전 필요)"
                                  : "팀 탈퇴"
                                : "멤버 내보내기"
                            }
                          >
                            {isSelf ? (
                              <LogOut size={14} />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="px-6 py-3 bg-muted/10 border-t border-border">
            <p className="text-[10px] text-muted-foreground italic">
              * OWNER 권한은 소유권 이전 기능을 통해서만 변경할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* Role Description Section */}
      <section className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 px-1">
          <Info size={18} className="text-muted-foreground" />
          <h2 className="text-base font-semibold">권한 안내</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TEAM_ROLES_LIST.map(
            ({ role, label, description, icon: Icon, colorClass, bgClass }) => (
              <div
                key={role}
                className="group flex flex-col gap-3 border border-border bg-card p-5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cx(
                      "p-2.5 w-fit transition-colors",
                      bgClass,
                      colorClass,
                    )}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {role}
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    {label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed break-keep">
                    {description}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
