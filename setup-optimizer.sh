#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# Trading Optimizer — Full Setup Script
# Run once from your machine:  bash setup-optimizer.sh
# ════════════════════════════════════════════════════════════
set -e

PROJECT_REF="mdvheizhciuvqychtwxr"

echo "🚀 Trading Optimizer Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"

# prompt for API key
read -rsp "הדבק את ה-ANTHROPIC_API_KEY שלך: " ANTHROPIC_API_KEY
echo ""

# 1. check supabase CLI
if ! command -v supabase &>/dev/null; then
  echo "📦 Installing Supabase CLI..."
  npm install -g supabase
fi

# 2. login
echo "🔑 Logging in to Supabase..."
supabase login

# 3. link project
echo "🔗 Linking project..."
cd "$(dirname "$0")"
supabase link --project-ref "$PROJECT_REF"

# 4. run migration
echo "📋 Running SQL migration..."
supabase db push

# 5. set env vars for the function
echo "🔐 Setting Edge Function secrets..."
supabase secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --project-ref "$PROJECT_REF"

# 6. deploy the optimizer function
echo "⚡ Deploying trading-optimizer..."
supabase functions deploy trading-optimizer \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

# 7. set up cron via SQL
echo "⏰ Setting up cron job (every minute)..."
ANON_KEY=$(supabase status --project-ref "$PROJECT_REF" 2>/dev/null | grep "anon key" | awk '{print $NF}')

if [ -n "$ANON_KEY" ]; then
  supabase db execute --project-ref "$PROJECT_REF" -- \
    "SELECT cron.schedule(
      'trading-optimizer',
      '* * * * *',
      \$cron\$SELECT net.http_post(
        url := 'https://${PROJECT_REF}.supabase.co/functions/v1/trading-optimizer',
        headers := '{\"Authorization\":\"Bearer ${ANON_KEY}\"}'::jsonb
      )\$cron\$
    );" && echo "✅ Cron מוגדר!" || echo "⚠️  הרץ את ה-SQL ידנית (ראה למטה)"
else
  echo "⚠️  לא מצאתי anon key — הרץ ב-SQL Editor ידנית"
fi

echo ""
echo "✅ הכל מוכן!"
echo ""
echo "🔗 קישורים מהירים:"
echo "   Functions: https://supabase.com/dashboard/project/${PROJECT_REF}/functions"
echo "   History:   https://supabase.com/dashboard/project/${PROJECT_REF}/editor"
echo ""
echo "אם ה-cron דרוש ידנית — הרץ ב-SQL Editor:"
echo "https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
echo ""
cat << 'SQL'
-- החלף YOUR_ANON_KEY ב-anon key מה-dashboard
SELECT cron.schedule(
  'trading-optimizer',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://mdvheizhciuvqychtwxr.supabase.co/functions/v1/trading-optimizer',
    headers := '{"Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);
SQL
