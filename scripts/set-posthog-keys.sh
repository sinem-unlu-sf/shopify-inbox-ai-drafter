#!/bin/bash
# Prompts for PostHog keys (input hidden) and writes them to .env.local. Never prints the keys.
set -e
cd "$(dirname "$0")/.."
ask() { local v; read -r -s -p "$1: " v; echo; v="$(printf '%s' "$v" | tr -d '[:space:]')"; printf '%s' "$v"; }
PHC=$(ask "Paste PostHog PROJECT API key (starts with phc_)")
PHX=$(ask "Paste PostHog PERSONAL API key (starts with phx_)")
case "$PHC" in phc_*) ;; *) echo "That project key doesn't start with phc_. Nothing saved."; exit 1;; esac
case "$PHX" in phx_*) ;; *) echo "That personal key doesn't start with phx_. Nothing saved."; exit 1;; esac
grep -v -E '^(POSTHOG_PROJECT_KEY|POSTHOG_PERSONAL_API_KEY|POSTHOG_HOST)=' .env.local > .env.local.tmp
printf 'POSTHOG_PROJECT_KEY=%s\nPOSTHOG_PERSONAL_API_KEY=%s\nPOSTHOG_HOST=https://us.i.posthog.com\n' "$PHC" "$PHX" >> .env.local.tmp
mv .env.local.tmp .env.local && chmod 600 .env.local
echo "Saved. Project key starts ${PHC:0:4}, personal key starts ${PHX:0:4}."
