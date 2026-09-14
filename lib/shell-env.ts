/**
 * 远程 SSH / Linux 运行环境加载器
 * 
 * 核心解决痛点：
 * SSH 非交互式 (non-interactive, non-login) Shell 执行命令时：
 * 1. 默认不会加载 ~/.bashrc（因非交互守卫 [ -z "$PS1" ] 或 case $- in *i*) ;; *) return;; esac 提前退出）
 * 2. 也不会加载 /etc/profile、~/.profile 或 ~/.bash_profile
 * 3. 导致通过 nvm、fnm、volta、pnpm、pip/pipx、asdf 安装在用户目录下的工具（如 node, npm, pm2, pnpm, gunicorn 等）
 *    无法在默认系统级 $PATH (/usr/bin:/bin) 中被找到。
 */

export const LINUX_ENV_LOADER = `
# 1. 尝试载入系统级与用户级 Profile
[ -f /etc/profile ] && . /etc/profile 2>/dev/null
[ -f ~/.profile ] && . ~/.profile 2>/dev/null
[ -f ~/.bash_profile ] && . ~/.bash_profile 2>/dev/null

# 2. 扩充常见系统和用户级 bin 路径
export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/bin:$HOME/.npm-global/bin:/opt/node/bin:/opt/nodejs/bin:/usr/local/node/bin"

# 3. 智能发现与激活 NVM (Node Version Manager)
if [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
  if ! command -v node >/dev/null 2>&1; then
    LATEST_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
    [ -n "$LATEST_NODE" ] && export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
  fi
fi

# 4. 智能发现 FNM / Volta / PNPM / asdf
if [ -d "$HOME/.fnm" ]; then
  export PATH="$HOME/.fnm/current/bin:$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env 2>/dev/null)" 2>/dev/null
fi
if [ -d "$HOME/.volta" ]; then
  export VOLTA_HOME="$HOME/.volta"
  export PATH="$VOLTA_HOME/bin:$PATH"
fi
if [ -d "$HOME/.local/share/pnpm" ]; then
  export PNPM_HOME="$HOME/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
fi
if [ -f "$HOME/.asdf/asdf.sh" ]; then
  . "$HOME/.asdf/asdf.sh" 2>/dev/null
fi

# 5. 确保 node 所在目录的同级命令（npm, npx, pm2 等）处于优先查找位置
if command -v node >/dev/null 2>&1; then
  NODE_BIN_DIR="$(dirname "$(command -v node)")"
  export PATH="$NODE_BIN_DIR:$PATH"
fi
`.trim()

/**
 * 为 SSH 执行的命令包装完整的环境初始化脚本
 */
export function wrapSshCommand(command: string): string {
  return `${LINUX_ENV_LOADER}\n${command}`
}
