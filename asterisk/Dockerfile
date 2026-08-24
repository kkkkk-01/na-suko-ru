# ==========================================================
# Asterisk 20 LTS - ナースコールシステム用（ソースビルド）
#
# 注意: Debian 11以降、asterisk は公式aptリポジトリから削除されたため
#       ソースからビルドする（サンドボックス実証と同一手順・同一バージョン系）。
#       ビルドは初回のみ約10-15分。以後はDockerレイヤーキャッシュが効く。
# ==========================================================
FROM debian:bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive
ARG ASTERISK_VERSION=20-current

RUN apt-get update && apt-get install -y \
    build-essential wget libedit-dev libjansson-dev libxml2-dev \
    libsqlite3-dev uuid-dev libssl-dev libsrtp2-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN wget -q http://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz \
    && tar xzf asterisk-${ASTERISK_VERSION}.tar.gz \
    && rm asterisk-${ASTERISK_VERSION}.tar.gz

RUN cd asterisk-20* \
    && ./configure --with-pjproject-bundled --disable-xmldoc > /dev/null \
    && make menuselect.makeopts \
    && menuselect/menuselect \
        --disable-category MENUSELECT_ADDONS \
        --disable-category MENUSELECT_CEL \
        --disable-category MENUSELECT_TESTS \
        --disable-category MENUSELECT_MOH \
        --disable-category MENUSELECT_EXTRA_SOUNDS \
        menuselect.makeopts \
    && make -j"$(nproc)" > /dev/null \
    && make install DESTDIR=/opt/asterisk-install > /dev/null \
    && make samples DESTDIR=/opt/asterisk-install > /dev/null

# ==========================================================
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libedit2 libjansson4 libxml2 libsqlite3-0 libuuid1 libssl3 libsrtp2-1 curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/asterisk-install/ /

# カスタム設定を上書きコピー（サンプル設定の上に被せる）
COPY config/ /etc/asterisk/

RUN groupadd -r asterisk 2>/dev/null; useradd -r -g asterisk asterisk 2>/dev/null; \
    mkdir -p /var/log/asterisk /var/lib/asterisk /var/spool/asterisk /var/run/asterisk && \
    chown -R asterisk:asterisk /etc/asterisk /var/log/asterisk /var/lib/asterisk /var/spool/asterisk /var/run/asterisk

# ポート公開: SIP(UDP/TCP) + SIP-WS + RTP
EXPOSE 5060/udp 5060/tcp 8088/tcp 10000-10100/udp

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD asterisk -rx "core show version" || exit 1

CMD ["asterisk", "-fvvv", "-U", "asterisk"]
