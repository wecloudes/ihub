#compdef ihub
# zsh completion for ihub
# Source this file: source completions/ihub.zsh
# Or copy to a directory in your $fpath (e.g. ~/.zsh/completions/)
# and add: autoload -Uz compinit && compinit

local -a commands types type_commands

commands=(
  'list:List entries by type'
  'search:Full-text search'
  'show:Show metadata for an entry'
  'preview:Render an entry with markdown formatting'
  'validate:Check fields and cross-references'
  'projects:Tree view of projects and artifacts'
  'create:Create a new entry from template'
  'push:Publish to the registry'
  'pull:Download from the registry'
  'remove:Remove from the registry (owner only)'
  'comment:Add a comment with rating'
  'comments:View comments and average rating'
  'register:Create account on a registry'
  'login:Log in with API key or Auth0'
  'passwd:Change password'
  'whoami:Show current user and registry'
  'config:Show server configuration (admin)'
  'audit:View audit trail (admin)'
  'metrics:Show metrics dashboard'
  'backup:Download DB backup (admin)'
  'admin:Admin commands (set-role, digest)'
  'version:Show version info'
  'help:Show help'
)

types=(agent agents skill skills rule rules memory memories prompt prompts)

type_commands=(
  'list:List entries'
  'show:Show metadata'
  'preview:Render with formatting'
  'create:Create from template'
  'push:Publish to registry'
  'pull:Download from registry'
  'remove:Remove from registry'
  'comment:Add a comment'
  'comments:View comments'
  'search:Search entries'
)

_ihub_types() {
  local -a singular_types
  singular_types=(agent skill rule memory prompt)
  _describe 'type' singular_types
}

_ihub_plural_types() {
  local -a plural_types
  plural_types=(agents skills rules memories prompts)
  _describe 'type' plural_types
}

_ihub_names() {
  local type=$1
  local dir=""
  case "$type" in
    agent|agents) dir="agents" ;;
    skill|skills) dir="skills" ;;
    rule|rules)   dir="rules" ;;
    memory|memories) dir="memories" ;;
    prompt|prompts) dir="prompts" ;;
  esac

  if [[ -n "$dir" && -d "$dir" ]]; then
    local -a names
    names=(${dir}/*.md(N:t:r))
    _describe 'name' names
  fi
}

_ihub() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \
    '1:command:->cmd' \
    '*::arg:->args'

  case $state in
    cmd)
      _describe 'command' commands
      _describe 'type (type-first syntax)' types
      ;;
    args)
      local cmd=${line[1]}
      case "$cmd" in
        list)
          _arguments '1:type:_ihub_plural_types'
          ;;
        show|preview|push|remove|comment|comments)
          _arguments \
            '1:type:_ihub_types' \
            '2:name:_ihub_names ${line[1]}'
          ;;
        create)
          _arguments \
            '1:type:_ihub_types' \
            '2:name:' \
            '(-i --interactive)'{-i,--interactive}'[Interactive mode]'
          ;;
        pull)
          _arguments \
            '1:type:_ihub_types' \
            '2:name:_ihub_names ${line[1]}' \
            '(-l --local)'{-l,--local}'[Install locally]' \
            '(-g --global)'{-g,--global}'[Install globally]'
          ;;
        search)
          _arguments \
            '--remote[Search remote registry]' \
            '1:query:'
          ;;
        register|login)
          _arguments \
            '1:url:(http://localhost:3000)' \
            '--auth0[Use Auth0 device flow]'
          ;;
        admin)
          local -a admin_cmds
          admin_cmds=(
            'set-role:Set user role'
            'digest:Send weekly Slack digest'
          )
          _arguments \
            '1:subcommand:_describe "admin command" admin_cmds' \
            '2:username:' \
            '3:role:(user admin)'
          ;;
        audit)
          _arguments \
            '--user[Filter by user]:username:' \
            '--action[Filter by action]:action:(push pull view list search comment delete-comment remove register backup set-role change-password versions view-comments)' \
            '--page[Page number]:page:' \
            '--limit[Results per page]:limit:'
          ;;
        metrics)
          _arguments \
            '--type[Filter by type]:type:(agents skills rules memories prompts)' \
            '--user[Filter by user]:username:' \
            '--name[Filter by name]:name:' \
            '--project[Filter by project]:project:'
          ;;
        backup)
          _arguments '1:output path:_files'
          ;;
        # Type-first syntax
        agent|agents|skill|skills|rule|rules|memory|memories|prompt|prompts)
          _arguments \
            '1:subcommand:_describe "command" type_commands' \
            '2:name:_ihub_names ${cmd}'
          ;;
      esac
      ;;
  esac
}

_ihub "$@"
