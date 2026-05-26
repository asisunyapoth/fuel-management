CREATE TABLE "fuel_types" (
	"fuel_type_id" varchar(20) PRIMARY KEY NOT NULL,
	"name_th" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"province_code" varchar(2) PRIMARY KEY NOT NULL,
	"name_th" varchar(100) NOT NULL,
	"region" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_code" varchar(2) NOT NULL,
	"fuel_type_id" varchar(20) NOT NULL,
	"rate_per_liter" numeric(8, 4) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "dealer_licenses" (
	"license_no" varchar(30) PRIMARY KEY NOT NULL,
	"section" varchar(2) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"station_id" serial PRIMARY KEY NOT NULL,
	"dealer_license_no" varchar(30) NOT NULL,
	"branch_code" varchar(20),
	"name" varchar(255) NOT NULL,
	"address" text,
	"province_code" varchar(2) NOT NULL,
	"tambon_code" varchar(10),
	"phone" varchar(20),
	"lat" numeric(10, 6),
	"lon" numeric(11, 6),
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" varchar(10) NOT NULL,
	"target_id" varchar(30) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_license_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"license_no" varchar(30) NOT NULL,
	"role" varchar(30) DEFAULT 'dealer_admin' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_license_links_user_id_license_no_unique" UNIQUE("user_id","license_no")
);
--> statement-breakpoint
CREATE TABLE "user_province_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"province_code" varchar(2) NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_province_links_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_station_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"station_id" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_station_links_user_id_station_id_unique" UNIQUE("user_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "reporting_periods" (
	"period_id" serial PRIMARY KEY NOT NULL,
	"mode" varchar(1) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_stations" (
	"campaign_id" integer NOT NULL,
	"station_id" integer NOT NULL,
	CONSTRAINT "campaign_stations_campaign_id_station_id_unique" UNIQUE("campaign_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaign_id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"required_fields" jsonb,
	"notification_message" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_014_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"fuel_type_id" varchar(20) NOT NULL,
	"volume_sold_liters" numeric(12, 2) NOT NULL,
	"tax_rate_per_liter" numeric(8, 4) NOT NULL,
	"tax_amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_016_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"fuel_type_id" varchar(20) NOT NULL,
	"opening_balance_liters" numeric(12, 2) NOT NULL,
	"receipt_in_liters" numeric(12, 2) NOT NULL,
	"sales_in_province_liters" numeric(12, 2) NOT NULL,
	"sales_out_of_province_liters" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"report_id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"period_id" integer,
	"campaign_id" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"mode_at_submission" varchar(1),
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(50) NOT NULL,
	"user_id" text,
	"payload_hash" varchar(64),
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "auth_verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"given_name" varchar(100),
	"family_name" varchar(100),
	"email" varchar(255),
	"phone_number" varchar(20),
	"citizen_id_encrypted" text,
	"ial_level" real,
	"province_code" varchar(10),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_unique" UNIQUE("user_id","role")
);
--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_province_code_provinces_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("province_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_fuel_type_id_fuel_types_fuel_type_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("fuel_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_dealer_license_no_dealer_licenses_license_no_fk" FOREIGN KEY ("dealer_license_no") REFERENCES "public"."dealer_licenses"("license_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_province_code_provinces_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("province_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_license_links" ADD CONSTRAINT "user_license_links_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_license_links" ADD CONSTRAINT "user_license_links_license_no_dealer_licenses_license_no_fk" FOREIGN KEY ("license_no") REFERENCES "public"."dealer_licenses"("license_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_province_links" ADD CONSTRAINT "user_province_links_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_province_links" ADD CONSTRAINT "user_province_links_province_code_provinces_province_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("province_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_links" ADD CONSTRAINT "user_station_links_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_links" ADD CONSTRAINT "user_station_links_station_id_stations_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("station_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_stations" ADD CONSTRAINT "campaign_stations_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_stations" ADD CONSTRAINT "campaign_stations_station_id_stations_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("station_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_014_lines" ADD CONSTRAINT "form_014_lines_report_id_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("report_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_014_lines" ADD CONSTRAINT "form_014_lines_fuel_type_id_fuel_types_fuel_type_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("fuel_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_016_lines" ADD CONSTRAINT "form_016_lines_report_id_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("report_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_016_lines" ADD CONSTRAINT "form_016_lines_fuel_type_id_fuel_types_fuel_type_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("fuel_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_station_id_stations_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("station_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_period_id_reporting_periods_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."reporting_periods"("period_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;