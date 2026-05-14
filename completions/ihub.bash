# bash completion for ihub
# Source this file: source completions/ihub.bash
# Or copy to: /etc/bash_completion.d/ihub

_ihub() {
  local cur prev words cword
  _init_completion || return

  local commands="list search show preview validate projects create push pull remove comment comments register login passwd whoami config audit metrics backup admin version help"
  local types="agent agents skill skills rule rules memory memories prompt prompts"
  local type_commands="list show preview create push pull remove comment comments search"

  # Position-based completion
  case $cword in
    1)
      # First arg: command or type
      COMPREPLY=($(compgen -W "$commands $types" -- "$cur"))
      ;;
    2)
      case "$prev" in
        # Commands that take a type
        list)
          COMPREPLY=($(compgen -W "agents skills rules memories prompts" -- "$cur"))
          ;;
        show|preview|create|push|pull|remove|comment|comments)
          COMPREPLY=($(compgen -W "agent skill rule memory prompt" -- "$cur"))
          ;;
        # Type-first: type was first arg, now complete subcommand
        agent|agents|skill|skills|rule|rules|memory|memories|prompt|prompts)
          COMPREPLY=($(compgen -W "$type_commands" -- "$cur"))
          ;;
        # Commands with URL arg
        register|login)
          COMPREPLY=($(compgen -W "http://localhost:3000" -- "$cur"))
          ;;
        admin)
          COMPREPLY=($(compgen -W "set-role digest" -- "$cur"))
          ;;
        audit)
          COMPREPLY=($(compgen -W "--user --action --page --limit" -- "$cur"))
          ;;
        metrics)
          COMPREPLY=($(compgen -W "--type --user --name --project" -- "$cur"))
          ;;
        backup)
          _filedir
          ;;
      esac
      ;;
    3)
      # Third arg: name (from local files) or subcommand args
      local cmd="${words[1]}"
      local type="${words[2]}"

      case "$cmd" in
        show|preview|push|remove|comment|comments)
          # Complete with local artifact names
          _ihub_complete_names "$type"
          ;;
        pull)
          _ihub_complete_names "$type"
          ;;
        create)
          # No completion for new names
          ;;
        admin)
          if [[ "$type" == "set-role" ]]; then
            # Username — no completion
            :
          fi
          ;;
        # Type-first: third arg is artifact name
        agent|agents|skill|skills|rule|rules|memory|memories|prompt|prompts)
          local subcmd="$type"
          case "$subcmd" in
            show|preview|push|remove|comment|comments|pull)
              _ihub_complete_names "$cmd"
              ;;
          esac
          ;;
      esac
      ;;
    4)
      local cmd="${words[1]}"
      case "$cmd" in
        pull)
          COMPREPLY=($(compgen -W "--local --global -l -g" -- "$cur"))
          ;;
        create)
          COMPREPLY=($(compgen -W "--interactive -i" -- "$cur"))
          ;;
        login)
          COMPREPLY=($(compgen -W "--auth0" -- "$cur"))
          ;;
        admin)
          if [[ "${words[2]}" == "set-role" ]]; then
            COMPREPLY=($(compgen -W "user admin" -- "$cur"))
          fi
          ;;
        # Type-first pull/create flags
        agent|agents|skill|skills|rule|rules|memory|memories|prompt|prompts)
          local subcmd="${words[2]}"
          case "$subcmd" in
            pull) COMPREPLY=($(compgen -W "--local --global -l -g" -- "$cur")) ;;
            create) COMPREPLY=($(compgen -W "--interactive -i" -- "$cur")) ;;
          esac
          ;;
      esac
      ;;
    *)
      # Flag completion for audit/metrics at any position
      local cmd="${words[1]}"
      case "$cmd" in
        audit)
          COMPREPLY=($(compgen -W "--user --action --page --limit" -- "$cur"))
          ;;
        metrics)
          COMPREPLY=($(compgen -W "--type --user --name --project" -- "$cur"))
          ;;
      esac
      ;;
  esac
}

_ihub_complete_names() {
  local type="$1"
  local dir=""
  case "$type" in
    agent|agents) dir="agents" ;;
    skill|skills) dir="skills" ;;
    rule|rules)   dir="rules" ;;
    memory|memories) dir="memories" ;;
    prompt|prompts) dir="prompts" ;;
  esac

  if [[ -n "$dir" && -d "$dir" ]]; then
    local names=$(ls "$dir"/*.md 2>/dev/null | sed 's|.*/||; s|\.md$||')
    COMPREPLY=($(compgen -W "$names" -- "$cur"))
  fi
}

complete -F _ihub ihub
