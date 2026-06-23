FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Asterisk インストール
RUN apt-get update && apt-get install -y \
    asterisk \
    asterisk-modules \
    asterisk-core-sounds-en-gsm \
    asterisk-core-sounds-en-wav \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# カスタム設定をコピー
COPY config/ /etc/asterisk/

# 権限設定
RUN chown -R asterisk:asterisk /etc/asterisk \
    && chown -R asterisk:asterisk /var/log/asterisk \
    && chown -R asterisk:asterisk /var/lib/asterisk \
    && chown -R asterisk:asterisk /var/spool/asterisk

# ポート公開
EXPOSE 5060/udp 5060/tcp 5061/tcp 8088/tcp 8089/tcp 10000-10100/udp

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD asterisk -rx "core show version" || exit 1

# Asterisk をフォアグラウンドで起動
CMD ["asterisk", "-fvvv"]
