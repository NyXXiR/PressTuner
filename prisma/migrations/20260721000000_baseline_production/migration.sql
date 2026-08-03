-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('WRITING', 'DONE', 'SUBMITTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ArticleStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'FINAL', 'BRIEF', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."ArticleType" AS ENUM ('PRESS_RELEASE', 'BLOG_POST', 'ANNOUNCEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ArticleUsageType" AS ENUM ('BRIEF', 'POLISH', 'GENERATE');

-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('GOOGLE', 'KAKAO', 'GITHUB');

-- CreateEnum
CREATE TYPE "public"."BillingOrderStatus" AS ENUM ('CREATED', 'PAYMENT_REQUESTED', 'CONFIRMED', 'CREDITED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."BillingProvider" AS ENUM ('TOSS');

-- CreateEnum
CREATE TYPE "public"."BrickSource" AS ENUM ('MANUAL', 'FILE_PARSE', 'AI_EXTRACT');

-- CreateEnum
CREATE TYPE "public"."CheckoutIntentStatus" AS ENUM ('OPEN', 'OPENED', 'BILLING_KEY_ISSUED', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."CouponBenefitType" AS ENUM ('PERCENT', 'FIXED_AMOUNT', 'PLAN_GRANT');

-- CreateEnum
CREATE TYPE "public"."CouponDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');

-- CreateEnum
CREATE TYPE "public"."CouponRedemptionStatus" AS ENUM ('APPLIED', 'REDEEMED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."CouponStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."FeedbackVote" AS ENUM ('LIKE', 'DISLIKE');

-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."NoticeScope" AS ENUM ('TEAM', 'GLOBAL');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('INVITATION', 'NOTICE', 'INFO', 'LINK');

-- CreateEnum
CREATE TYPE "public"."PlanCategory" AS ENUM ('PRESS', 'CAREER', 'STANDARD');

-- CreateEnum
CREATE TYPE "public"."PlanType" AS ENUM ('FREE', 'PRO', 'ENTERPRISE', 'BASIC');

-- CreateEnum
CREATE TYPE "public"."ProductLine" AS ENUM ('PRESS', 'CAREER');

-- CreateEnum
CREATE TYPE "public"."QuestionAiMessageKind" AS ENUM ('PROMPT', 'STATUS', 'SUGGESTION', 'APPLY', 'DISCARD');

-- CreateEnum
CREATE TYPE "public"."QuestionAiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."ReviewAssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."SignalSource" AS ENUM ('GENERATION', 'MANUAL_EDIT', 'STATUS_TRANSITION', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPayProvider" AS ENUM ('INICIS', 'KAKAOPAY');

-- CreateEnum
CREATE TYPE "public"."SuggestionType" AS ENUM ('SPELLING', 'LOGIC', 'DATA_MISSING', 'KEYWORD', 'LENGTH', 'TONE');

-- CreateEnum
CREATE TYPE "public"."TeamBillingHistoryStatus" AS ENUM ('SUCCESS', 'REQUESTED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."TeamBillingHistoryType" AS ENUM ('PAYMENT', 'CANCEL', 'REFUND');

-- CreateEnum
CREATE TYPE "public"."TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "public"."UsageAction" AS ENUM ('GENERATE_ARTICLE', 'REFINE_ARTICLE', 'TRANSLATE', 'CHAT', 'ETC', 'PARSE_RESUME', 'GENERATE_COVER_LETTER', 'POLISH_COVER_LETTER');

-- CreateTable
CREATE TABLE "public"."ai_quota_override" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plan_id" TEXT,
    "surface" TEXT,
    "action" TEXT,
    "window_key" TEXT,
    "limit_units" INTEGER,
    "action_units" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_quota_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."application" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "company_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "jd_text" TEXT,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'WRITING',
    "deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."article" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "body_json" JSONB,
    "raw_input" TEXT,
    "refinement_qna" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."ArticleStatus" NOT NULL DEFAULT 'BRIEF',
    "style_score" INTEGER,
    "style_summary" TEXT,
    "type" "public"."ArticleType" NOT NULL DEFAULT 'PRESS_RELEASE',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "style_guide_id" TEXT,
    "last_polish_result" JSONB,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "share_token" TEXT,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."article_review_assignment" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "status" "public"."ReviewAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_review_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."article_usage_event" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT,
    "type" "public"."ArticleUsageType" NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."article_usage_stat" (
    "article_id" TEXT NOT NULL,
    "brief_used" INTEGER NOT NULL DEFAULT 0,
    "polish_used" INTEGER NOT NULL DEFAULT 0,
    "last_brief_at" TIMESTAMP(3),
    "last_polish_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "generate_used" INTEGER NOT NULL DEFAULT 0,
    "team_id" TEXT,
    "re_polish_count" INTEGER NOT NULL DEFAULT 0,
    "polish_session_id" TEXT,

    CONSTRAINT "article_usage_stat_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "public"."billing_order" (
    "id" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'TOSS',
    "order_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "amount" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" "public"."BillingOrderStatus" NOT NULL DEFAULT 'CREATED',
    "payment_key" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."billing_webhook_event" (
    "id" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'TOSS',
    "transmission_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blog_extra" (
    "article_id" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[],
    "cover_url" TEXT,

    CONSTRAINT "blog_extra_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "public"."brief_normalize_cache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brief_normalize_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."brief_normalize_ip_usage" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brief_normalize_ip_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checkout_intent" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "pay_provider" "public"."SubscriptionPayProvider" NOT NULL,
    "coupon_code" TEXT,
    "attempt_id" TEXT NOT NULL,
    "status" "public"."CheckoutIntentStatus" NOT NULL DEFAULT 'OPEN',
    "last_error" TEXT,
    "opened_at" TIMESTAMP(3),
    "billing_key_issued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "benefit_type" "public"."CouponBenefitType" NOT NULL,
    "discount_percent" INTEGER,
    "discount_amount" INTEGER,
    "discount_duration" "public"."CouponDuration",
    "discount_duration_months" INTEGER,
    "grant_plan_id" TEXT,
    "grant_plan_type" "public"."PlanType",
    "grant_plan_category" "public"."PlanCategory",
    "grant_months" INTEGER,
    "applicable_plan_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_plan_types" "public"."PlanType"[] DEFAULT ARRAY[]::"public"."PlanType"[],
    "applicable_plan_categories" "public"."PlanCategory"[] DEFAULT ARRAY[]::"public"."PlanCategory"[],
    "min_amount" INTEGER,
    "max_redemptions" INTEGER,
    "max_redemptions_per_user" INTEGER,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."coupon_redemption" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT,
    "team_id" TEXT,
    "billing_order_id" TEXT,
    "status" "public"."CouponRedemptionStatus" NOT NULL DEFAULT 'APPLIED',
    "discount_amount" INTEGER,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "meta" JSONB,

    CONSTRAINT "coupon_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."credit_ledger" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "billing_order_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."example_article" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'generated',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "example_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experience_brick" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "period" TEXT,
    "start_date" TIMESTAMP(3),
    "tags" TEXT[],
    "source" "public"."BrickSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "original_text" TEXT,

    CONSTRAINT "experience_brick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."feedback" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "user_id" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vote" "public"."FeedbackVote" NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."feedback_block" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."guide_compiled" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "rules_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_slow_compiled_at" TIMESTAMP(3),

    CONSTRAINT "guide_compiled_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notice" (
    "id" TEXT NOT NULL,
    "team_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "send_as_notification" BOOLEAN NOT NULL DEFAULT false,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "scope" "public"."NoticeScope" NOT NULL DEFAULT 'TEAM',

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification" (
    "id" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "banner_text" TEXT,
    "notice_id" TEXT,
    "invitation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_read" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_read_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."oauth_account" (
    "id" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "profileJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" "public"."AuthProvider" NOT NULL,

    CONSTRAINT "oauth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."press_extra" (
    "article_id" TEXT NOT NULL,
    "lead" TEXT,
    "fact" TEXT,

    CONSTRAINT "press_extra_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "public"."question" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "char_limit" INTEGER,
    "answer" TEXT,
    "ai_advice" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_ai_message" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "role" "public"."QuestionAiMessageRole" NOT NULL,
    "kind" "public"."QuestionAiMessageKind" NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_on_brick" (
    "question_id" TEXT NOT NULL,
    "brick_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_ai_suggested" BOOLEAN NOT NULL DEFAULT false,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "question_on_brick_pkey" PRIMARY KEY ("question_id","brick_id")
);

-- CreateTable
CREATE TABLE "public"."resume_extra" (
    "article_id" TEXT NOT NULL,
    "headline" TEXT,
    "sections" JSONB,
    "qa_drafts" JSONB,
    "meta" JSONB,

    CONSTRAINT "resume_extra_pkey" PRIMARY KEY ("article_id")
);

-- CreateTable
CREATE TABLE "public"."session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentTeamId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."style_guide" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "base_prompt" TEXT,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_compiling" BOOLEAN NOT NULL DEFAULT false,
    "pending_signal_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "style_guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."style_guide_default" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "type" "public"."ArticleType" NOT NULL,
    "guide_id" TEXT NOT NULL,

    CONSTRAINT "style_guide_default_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."style_signal" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "article_id" TEXT,
    "source" "public"."SignalSource" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."suggestion_ticket" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "type" "public"."SuggestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "original_text" TEXT,
    "result_text" TEXT,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "plan" "public"."PlanType" NOT NULL DEFAULT 'FREE',
    "feedback_enabled" BOOLEAN NOT NULL DEFAULT true,
    "billing_key" TEXT,
    "membership_status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "next_billing_at" TIMESTAMP(3),
    "pay_provider" "public"."SubscriptionPayProvider",
    "pending_plan" "public"."PlanType",
    "pending_plan_starts_at" TIMESTAMP(3),
    "plan_expires_at" TIMESTAMP(3),
    "last_paid_at" TIMESTAMP(3),
    "last_payment_id" TEXT,
    "cancel_requested_at" TIMESTAMP(3),
    "pending_plan_id" TEXT,
    "plan_id" TEXT,
    "resume_enabled" BOOLEAN NOT NULL DEFAULT false,
    "limit_article_monthly" INTEGER NOT NULL DEFAULT 0,
    "limit_resume_monthly" INTEGER NOT NULL DEFAULT 0,
    "next_payment_amount" INTEGER DEFAULT 0,
    "plan_category" "public"."PlanCategory" NOT NULL DEFAULT 'PRESS',
    "usage_article_monthly" INTEGER NOT NULL DEFAULT 0,
    "usage_resume_monthly" INTEGER NOT NULL DEFAULT 0,
    "allow_member_edit" BOOLEAN NOT NULL DEFAULT false,
    "allow_member_finalize" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_billing_history" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "public"."TeamBillingHistoryType" NOT NULL,
    "status" "public"."TeamBillingHistoryStatus" NOT NULL DEFAULT 'SUCCESS',
    "provider" "public"."SubscriptionPayProvider",
    "plan" "public"."PlanType",
    "plan_id" TEXT,
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "external_id" TEXT,
    "receipt_url" TEXT,
    "meta" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_billing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_invitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "inviteeLabel" TEXT,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_member" (
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "public"."TeamRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."team_product_subscription" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "product" "public"."ProductLine" NOT NULL,
    "plan_id" TEXT,
    "plan" "public"."PlanType" NOT NULL DEFAULT 'FREE',
    "membership_status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "pay_provider" "public"."SubscriptionPayProvider",
    "billing_key" TEXT,
    "next_payment_amount" INTEGER NOT NULL DEFAULT 0,
    "next_billing_at" TIMESTAMP(3),
    "plan_expires_at" TIMESTAMP(3),
    "pending_plan_id" TEXT,
    "pending_plan" "public"."PlanType",
    "pending_plan_starts_at" TIMESTAMP(3),
    "cancel_requested_at" TIMESTAMP(3),
    "last_payment_id" TEXT,
    "last_paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_product_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_log" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "public"."UsageAction" NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL,
    "target_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user" (
    "id" TEXT NOT NULL,
    "login_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "avatar_url" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "delete_scheduled_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_article_activity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_article_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_quota_override_key_key" ON "public"."ai_quota_override"("key" ASC);

-- CreateIndex
CREATE INDEX "ai_quota_override_kind_action_idx" ON "public"."ai_quota_override"("kind" ASC, "action" ASC);

-- CreateIndex
CREATE INDEX "ai_quota_override_kind_plan_id_surface_idx" ON "public"."ai_quota_override"("kind" ASC, "plan_id" ASC, "surface" ASC);

-- CreateIndex
CREATE INDEX "application_deadline_idx" ON "public"."application"("deadline" ASC);

-- CreateIndex
CREATE INDEX "application_team_id_idx" ON "public"."application"("team_id" ASC);

-- CreateIndex
CREATE INDEX "application_user_id_status_idx" ON "public"."application"("user_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "article_share_token_key" ON "public"."article"("share_token" ASC);

-- CreateIndex
CREATE INDEX "article_style_guide_id_idx" ON "public"."article"("style_guide_id" ASC);

-- CreateIndex
CREATE INDEX "article_team_id_status_created_at_idx" ON "public"."article"("team_id" ASC, "status" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "article_review_assignment_article_id_reviewer_id_key" ON "public"."article_review_assignment"("article_id" ASC, "reviewer_id" ASC);

-- CreateIndex
CREATE INDEX "article_review_assignment_article_id_status_idx" ON "public"."article_review_assignment"("article_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "article_review_assignment_reviewer_id_status_created_at_idx" ON "public"."article_review_assignment"("reviewer_id" ASC, "status" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "article_review_assignment_team_id_status_created_at_idx" ON "public"."article_review_assignment"("team_id" ASC, "status" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "article_usage_event_article_id_created_at_idx" ON "public"."article_usage_event"("article_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "article_usage_event_type_created_at_idx" ON "public"."article_usage_event"("type" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "article_usage_stat_team_id_article_id_idx" ON "public"."article_usage_stat"("team_id" ASC, "article_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "billing_order_order_id_key" ON "public"."billing_order"("order_id" ASC);

-- CreateIndex
CREATE INDEX "billing_order_team_id_created_at_idx" ON "public"."billing_order"("team_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "billing_webhook_event_event_type_received_at_idx" ON "public"."billing_webhook_event"("event_type" ASC, "received_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_event_transmission_id_key" ON "public"."billing_webhook_event"("transmission_id" ASC);

-- CreateIndex
CREATE INDEX "brief_normalize_cache_expiresAt_idx" ON "public"."brief_normalize_cache"("expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "brief_normalize_cache_key_key" ON "public"."brief_normalize_cache"("key" ASC);

-- CreateIndex
CREATE INDEX "brief_normalize_ip_usage_dayKey_idx" ON "public"."brief_normalize_ip_usage"("dayKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "brief_normalize_ip_usage_ip_dayKey_key" ON "public"."brief_normalize_ip_usage"("ip" ASC, "dayKey" ASC);

-- CreateIndex
CREATE INDEX "checkout_intent_status_expires_at_idx" ON "public"."checkout_intent"("status" ASC, "expires_at" ASC);

-- CreateIndex
CREATE INDEX "checkout_intent_team_id_created_at_idx" ON "public"."checkout_intent"("team_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_intent_token_hash_key" ON "public"."checkout_intent"("token_hash" ASC);

-- CreateIndex
CREATE INDEX "checkout_intent_user_id_created_at_idx" ON "public"."checkout_intent"("user_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_key" ON "public"."coupon"("code" ASC);

-- CreateIndex
CREATE INDEX "coupon_status_valid_from_valid_to_idx" ON "public"."coupon"("status" ASC, "valid_from" ASC, "valid_to" ASC);

-- CreateIndex
CREATE INDEX "coupon_redemption_billing_order_id_idx" ON "public"."coupon_redemption"("billing_order_id" ASC);

-- CreateIndex
CREATE INDEX "coupon_redemption_coupon_id_applied_at_idx" ON "public"."coupon_redemption"("coupon_id" ASC, "applied_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemption_coupon_id_user_id_key" ON "public"."coupon_redemption"("coupon_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "coupon_redemption_team_id_applied_at_idx" ON "public"."coupon_redemption"("team_id" ASC, "applied_at" ASC);

-- CreateIndex
CREATE INDEX "coupon_redemption_user_id_applied_at_idx" ON "public"."coupon_redemption"("user_id" ASC, "applied_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_billing_order_id_key" ON "public"."credit_ledger"("billing_order_id" ASC);

-- CreateIndex
CREATE INDEX "credit_ledger_team_id_created_at_idx" ON "public"."credit_ledger"("team_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "experience_brick_team_id_idx" ON "public"."experience_brick"("team_id" ASC);

-- CreateIndex
CREATE INDEX "experience_brick_user_id_start_date_idx" ON "public"."experience_brick"("user_id" ASC, "start_date" ASC);

-- CreateIndex
CREATE INDEX "feedback_article_id_created_at_idx" ON "public"."feedback"("article_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_block_team_id_user_id_key" ON "public"."feedback_block"("team_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "guide_compiled_guide_id_key" ON "public"."guide_compiled"("guide_id" ASC);

-- CreateIndex
CREATE INDEX "notice_scope_created_at_idx" ON "public"."notice"("scope" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "notice_team_id_created_at_idx" ON "public"."notice"("team_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_invitation_id_key" ON "public"."notification"("invitation_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_notice_id_key" ON "public"."notification"("notice_id" ASC);

-- CreateIndex
CREATE INDEX "notification_team_id_is_active_created_at_idx" ON "public"."notification"("team_id" ASC, "is_active" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "notification_type_created_at_idx" ON "public"."notification"("type" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "notification_user_id_is_active_created_at_idx" ON "public"."notification"("user_id" ASC, "is_active" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_read_notification_id_user_id_key" ON "public"."notification_read"("notification_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "notification_read_user_id_read_at_idx" ON "public"."notification_read"("user_id" ASC, "read_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_account_provider_providerAccountId_key" ON "public"."oauth_account"("provider" ASC, "providerAccountId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_account_provider_userId_key" ON "public"."oauth_account"("provider" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "oauth_account_userId_idx" ON "public"."oauth_account"("userId" ASC);

-- CreateIndex
CREATE INDEX "question_application_id_order_idx" ON "public"."question"("application_id" ASC, "order" ASC);

-- CreateIndex
CREATE INDEX "question_ai_message_question_id_created_at_idx" ON "public"."question_ai_message"("question_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "question_on_brick_brick_id_idx" ON "public"."question_on_brick"("brick_id" ASC);

-- CreateIndex
CREATE INDEX "session_currentTeamId_idx" ON "public"."session"("currentTeamId" ASC);

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "public"."session"("userId" ASC);

-- CreateIndex
CREATE INDEX "style_guide_team_id_is_default_idx" ON "public"."style_guide"("team_id" ASC, "is_default" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "style_guide_default_team_id_type_key" ON "public"."style_guide_default"("team_id" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "style_signal_article_id_idx" ON "public"."style_signal"("article_id" ASC);

-- CreateIndex
CREATE INDEX "style_signal_guide_id_created_at_idx" ON "public"."style_signal"("guide_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "suggestion_ticket_question_id_is_resolved_idx" ON "public"."suggestion_ticket"("question_id" ASC, "is_resolved" ASC);

-- CreateIndex
CREATE INDEX "team_next_billing_at_idx" ON "public"."team"("next_billing_at" ASC);

-- CreateIndex
CREATE INDEX "team_plan_expires_at_idx" ON "public"."team"("plan_expires_at" ASC);

-- CreateIndex
CREATE INDEX "team_plan_membership_status_idx" ON "public"."team"("plan" ASC, "membership_status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "team_slug_key" ON "public"."team"("slug" ASC);

-- CreateIndex
CREATE INDEX "team_billing_history_external_id_idx" ON "public"."team_billing_history"("external_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "team_billing_history_external_id_key" ON "public"."team_billing_history"("external_id" ASC);

-- CreateIndex
CREATE INDEX "team_billing_history_team_id_occurred_at_idx" ON "public"."team_billing_history"("team_id" ASC, "occurred_at" ASC);

-- CreateIndex
CREATE INDEX "team_invitation_inviteeUserId_status_idx" ON "public"."team_invitation"("inviteeUserId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "team_invitation_teamId_status_createdAt_idx" ON "public"."team_invitation"("teamId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "team_product_subscription_next_billing_at_idx" ON "public"."team_product_subscription"("next_billing_at" ASC);

-- CreateIndex
CREATE INDEX "team_product_subscription_plan_expires_at_idx" ON "public"."team_product_subscription"("plan_expires_at" ASC);

-- CreateIndex
CREATE INDEX "team_product_subscription_product_membership_status_idx" ON "public"."team_product_subscription"("product" ASC, "membership_status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "team_product_subscription_team_id_product_key" ON "public"."team_product_subscription"("team_id" ASC, "product" ASC);

-- CreateIndex
CREATE INDEX "usage_log_team_id_created_at_idx" ON "public"."usage_log"("team_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "public"."user"("email" ASC);

-- CreateIndex
CREATE INDEX "user_label_idx" ON "public"."user"("label" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_login_id_key" ON "public"."user"("login_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_article_activity_user_id_article_id_key" ON "public"."user_article_activity"("user_id" ASC, "article_id" ASC);

-- CreateIndex
CREATE INDEX "user_article_activity_user_id_updated_at_idx" ON "public"."user_article_activity"("user_id" ASC, "updated_at" ASC);

-- AddForeignKey
ALTER TABLE "public"."application" ADD CONSTRAINT "application_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."application" ADD CONSTRAINT "application_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article" ADD CONSTRAINT "article_style_guide_id_fkey" FOREIGN KEY ("style_guide_id") REFERENCES "public"."style_guide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article" ADD CONSTRAINT "article_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article" ADD CONSTRAINT "article_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_review_assignment" ADD CONSTRAINT "article_review_assignment_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_review_assignment" ADD CONSTRAINT "article_review_assignment_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_review_assignment" ADD CONSTRAINT "article_review_assignment_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_review_assignment" ADD CONSTRAINT "article_review_assignment_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_usage_event" ADD CONSTRAINT "article_usage_event_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_usage_event" ADD CONSTRAINT "article_usage_event_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_usage_event" ADD CONSTRAINT "article_usage_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."article_usage_stat" ADD CONSTRAINT "article_usage_stat_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."billing_order" ADD CONSTRAINT "billing_order_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."billing_order" ADD CONSTRAINT "billing_order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blog_extra" ADD CONSTRAINT "blog_extra_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checkout_intent" ADD CONSTRAINT "checkout_intent_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checkout_intent" ADD CONSTRAINT "checkout_intent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemption" ADD CONSTRAINT "coupon_redemption_billing_order_id_fkey" FOREIGN KEY ("billing_order_id") REFERENCES "public"."billing_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemption" ADD CONSTRAINT "coupon_redemption_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemption" ADD CONSTRAINT "coupon_redemption_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemption" ADD CONSTRAINT "coupon_redemption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."credit_ledger" ADD CONSTRAINT "credit_ledger_billing_order_id_fkey" FOREIGN KEY ("billing_order_id") REFERENCES "public"."billing_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."credit_ledger" ADD CONSTRAINT "credit_ledger_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."example_article" ADD CONSTRAINT "example_article_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experience_brick" ADD CONSTRAINT "experience_brick_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experience_brick" ADD CONSTRAINT "experience_brick_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback" ADD CONSTRAINT "feedback_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback" ADD CONSTRAINT "feedback_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback_block" ADD CONSTRAINT "feedback_block_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."feedback_block" ADD CONSTRAINT "feedback_block_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."guide_compiled" ADD CONSTRAINT "guide_compiled_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "public"."style_guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notice" ADD CONSTRAINT "notice_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notice" ADD CONSTRAINT "notice_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "notification_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."team_invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "notification_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "notification_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_read" ADD CONSTRAINT "notification_read_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_read" ADD CONSTRAINT "notification_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."oauth_account" ADD CONSTRAINT "oauth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."press_extra" ADD CONSTRAINT "press_extra_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question" ADD CONSTRAINT "question_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_ai_message" ADD CONSTRAINT "question_ai_message_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_on_brick" ADD CONSTRAINT "question_on_brick_brick_id_fkey" FOREIGN KEY ("brick_id") REFERENCES "public"."experience_brick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_on_brick" ADD CONSTRAINT "question_on_brick_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resume_extra" ADD CONSTRAINT "resume_extra_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session" ADD CONSTRAINT "session_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "public"."team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."style_guide" ADD CONSTRAINT "style_guide_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."style_guide_default" ADD CONSTRAINT "style_guide_default_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "public"."style_guide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."style_guide_default" ADD CONSTRAINT "style_guide_default_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."style_signal" ADD CONSTRAINT "style_signal_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."style_signal" ADD CONSTRAINT "style_signal_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "public"."style_guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."suggestion_ticket" ADD CONSTRAINT "suggestion_ticket_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_billing_history" ADD CONSTRAINT "team_billing_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_billing_history" ADD CONSTRAINT "team_billing_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_invitation" ADD CONSTRAINT "team_invitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_invitation" ADD CONSTRAINT "team_invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_invitation" ADD CONSTRAINT "team_invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_member" ADD CONSTRAINT "team_member_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_member" ADD CONSTRAINT "team_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_product_subscription" ADD CONSTRAINT "team_product_subscription_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_log" ADD CONSTRAINT "usage_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_log" ADD CONSTRAINT "usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_article_activity" ADD CONSTRAINT "user_article_activity_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_article_activity" ADD CONSTRAINT "user_article_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
