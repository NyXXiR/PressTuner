CREATE TABLE "resume_document" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resume_document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resume_document_user_id_key" ON "resume_document"("user_id");

ALTER TABLE "resume_document" ADD CONSTRAINT "resume_document_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
