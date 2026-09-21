ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'uploading';--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "char_start" integer;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "char_end" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_status_check" CHECK ("documents"."status" IN ('uploading', 'processing', 'ready', 'failed'));--> statement-breakpoint
DROP TYPE "public"."document_status";