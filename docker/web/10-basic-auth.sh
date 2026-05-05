#!/bin/sh
set -eu

auth_user="${GTD_BASIC_AUTH_USER:-admin}"
auth_password="${GTD_BASIC_AUTH_PASSWORD:-admin}"

printf '%s\n' "$auth_password" | htpasswd -Bci /etc/nginx/.htpasswd "$auth_user" >/dev/null
