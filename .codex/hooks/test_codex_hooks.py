"""Tests for codex_hooks.py.

Run: python3 -m unittest test_codex_hooks
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
HOOK = os.path.join(HERE, "codex_hooks.py")


class CodexHooksTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.state = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q"], cwd=self.dir, check=True)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)
        shutil.rmtree(self.state, ignore_errors=True)

    def run_hook(self, payload):
        data = {
            "session_id": "sess-1",
            "turn_id": "turn-1",
            "cwd": self.dir,
            "permission_mode": "dontAsk",
        }
        data.update(payload)
        env = dict(os.environ, DEVMODE_CODEX_HOOK_STATE_DIR=self.state)
        return subprocess.run(
            [sys.executable, HOOK],
            input=json.dumps(data),
            capture_output=True,
            text=True,
            cwd=self.dir,
            env=env,
        )

    def assert_allowed(self, proc):
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout.strip(), "")

    def assert_denied(self, proc):
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        out = payload["hookSpecificOutput"]
        self.assertEqual(out["hookEventName"], "PreToolUse")
        self.assertEqual(out["permissionDecision"], "deny")

    def assert_blocked(self, proc):
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["decision"], "block")

    def test_pretool_denies_sudo(self):
        proc = self.run_hook(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "sudo rm -rf build"},
            }
        )
        self.assert_denied(proc)

    def test_pretool_maps_ask_to_deny_until_override_marker(self):
        blocked = self.run_hook(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "rm -rf build"},
            }
        )
        self.assert_denied(blocked)
        allowed = self.run_hook(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "rm -rf build # DEVMODE-GUARDRAIL-OK"},
            }
        )
        self.assert_allowed(allowed)

    def test_pretool_denies_patch_to_env(self):
        proc = self.run_hook(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "apply_patch",
                "tool_input": {"command": "*** Begin Patch\n*** Update File: .env\n@@\n+x=1\n*** End Patch\n"},
            }
        )
        self.assert_denied(proc)

    def test_risky_action_without_later_verify_blocks_stop(self):
        self.assert_allowed(
            self.run_hook(
                {
                    "hook_event_name": "PostToolUse",
                    "tool_name": "Bash",
                    "tool_input": {"command": "docker build -t app ."},
                    "tool_response": {"exit_code": 0},
                }
            )
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "done"})
        self.assert_blocked(proc)

    def test_verify_after_risky_allows_stop(self):
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "docker build -t app ."},
                "tool_response": {"exit_code": 0},
            }
        )
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "pytest -q"},
                "tool_response": "3 passed",
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "tests pass"})
        self.assert_allowed(proc)

    def test_failed_verify_after_risky_still_blocks_stop(self):
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "docker build -t app ."},
                "tool_response": {"exit_code": 0},
            }
        )
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "pytest -q"},
                "tool_response": {"exit_code": 1, "output": "1 failed"},
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "tests failed"})
        self.assert_blocked(proc)

    def test_full_devmode_without_orchestrator_blocks(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode build a dashboard"})
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase summary"})
        self.assert_blocked(proc)

    def test_every_phase_driving_mode_requires_orchestrator(self):
        prompts = [
            "/devmode",
            "/devmode start new-project build it",
            "/devmode adopt ./legacy",
            "/devmode lean build the smallest thing",
        ]
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": prompt})
                proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase summary"})
                self.assert_blocked(proc)

    def test_lean_goal_and_inline_modes_do_not_require_orchestrator(self):
        prompts = [
            "/devmode c inspect logs",
            "/devmode do add a test",
            "/devmode wiki start ./kb",
            "/devmode update ./project",
            "/devmode goal ship it",
            "/devmode plan ship it",
            "/devmode lean goal ship it",
            "/devmode lean plan ship it",
        ]
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": prompt})
                proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "inline result"})
                self.assert_allowed(proc)

    def test_nonbreaking_space_after_slash_command_is_parsed_normally(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode\u00a0do add a test"})
        self.assert_allowed(
            self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "inline result"})
        )

        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode\u00a0build it"})
        self.assert_blocked(
            self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase result"})
        )

    def test_full_devmode_with_orchestrator_allows(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode build a dashboard"})
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Agent",
                "tool_input": {"agent_type": "devmode-orchestrator", "prompt": "drive the phase"},
                "tool_response": "gate reached",
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase summary"})
        self.assert_allowed(proc)

    def test_spawn_message_can_identify_orchestrator_adapter(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode audit compatibility"})
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "spawn_agent",
                "tool_input": {"message": "Act as devmode-orchestrator and drive the phase"},
                "tool_response": {"agent_id": "agent-1"},
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase summary"})
        self.assert_allowed(proc)

    def test_failed_orchestrator_spawn_does_not_satisfy_phase_gate(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode build it"})
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "spawn_agent",
                "tool_input": {"message": "Act as devmode-orchestrator"},
                "tool_response": {"exit_code": 1, "output": "spawn failed"},
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "phase summary"})
        self.assert_blocked(proc)

    def test_verify_override_does_not_bypass_phase_gate(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode build it"})
        proc = self.run_hook(
            {"hook_event_name": "Stop", "last_assistant_message": "VERIFY-OK: no risky operation"}
        )
        self.assert_blocked(proc)

    def test_nonfull_devmode_allows(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "/devmode do add a test"})
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "verified"})
        self.assert_allowed(proc)

    def test_plain_mention_of_devmode_does_not_count_as_invocation(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "prompt": "Explain how devmode works"})
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "explained"})
        self.assert_allowed(proc)

    def test_verify_override_allows(self):
        self.run_hook(
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": {"command": "docker build -t app ."},
                "tool_response": {"exit_code": 0},
            }
        )
        proc = self.run_hook({"hook_event_name": "Stop", "last_assistant_message": "VERIFY-OK: docs-only"})
        self.assert_allowed(proc)


if __name__ == "__main__":
    unittest.main()
