#!/bin/bash
# BookMark 后端守护进程管理脚本
# 用法: ./start-backend.sh {start|stop|restart|status}

set -e

PROJECT_DIR="/Users/engine/.openclaw/workspace/Projects/BookMark"
BACKEND_DIR="$PROJECT_DIR/bookmark-nav-backend"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/backend.log"
PID_FILE="$LOG_DIR/backend.pid"
PORT="${PORT:-8080}"

mkdir -p "$LOG_DIR"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if is_running; then
    echo "⚠️  已在运行 (PID $(cat "$PID_FILE"))，端口 $PORT"
    return 0
  fi
  echo "🚀 启动 BookMark 后端，端口 $PORT ..."
  cd "$BACKEND_DIR"
  PORT="$PORT" nohup node server.js > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown 2>/dev/null || true
  sleep 2
  if is_running; then
    echo "✅ 已启动 (PID $(cat "$PID_FILE"))"
    tail -3 "$LOG_FILE"
  else
    echo "❌ 启动失败，查看日志: $LOG_FILE"
    tail -20 "$LOG_FILE"
    return 1
  fi
}

stop() {
  if ! is_running; then
    echo "ℹ️  未运行"
    rm -f "$PID_FILE"
    return 0
  fi
  PID=$(cat "$PID_FILE")
  echo "🛑 停止 PID $PID ..."
  kill "$PID" 2>/dev/null || true
  # 兜底强杀
  for i in 1 2 3 4 5; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "✅ 已停止"
}

status() {
  if is_running; then
    PID=$(cat "$PID_FILE")
    echo "✅ 运行中  PID=$PID  PORT=$PORT"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true
  else
    echo "❌ 未运行"
  fi
}

restart() { stop; start; }

case "${1:-status}" in
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  status)  status ;;
  *) echo "用法: $0 {start|stop|restart|status}"; exit 1 ;;
esac
