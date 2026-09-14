"""Tests for the guardrails functional core — pure values, no mocks.

Run:  python3 -m unittest test_guardrails   (from this directory)
"""
import unittest

from guardrails import evaluate


def bash(cmd):
    return evaluate("Bash", {"command": cmd})


def write(path):
    return evaluate("Write", {"file_path": path})


class GuardrailTest(unittest.TestCase):
    # deny rules
    def test_sudo_denied(self):
        self.assertEqual(bash("sudo rm x")[0], "deny")

    def test_force_push_denied(self):
        self.assertEqual(bash("git push --force origin main")[0], "deny")
        self.assertEqual(bash("git push -f")[0], "deny")

    def test_no_verify_denied(self):
        self.assertEqual(bash("git commit --no-verify -m x")[0], "deny")

    def test_rm_rf_root_denied(self):
        self.assertEqual(bash("rm -rf /")[0], "deny")

    def test_write_to_env_denied(self):
        self.assertEqual(write("config/.env")[0], "deny")

    def test_write_to_git_denied(self):
        self.assertEqual(write(".git/config")[0], "deny")

    # ask (warn) rules
    def test_reset_hard_asks(self):
        self.assertEqual(bash("git reset --hard HEAD~1")[0], "ask")

    def test_rm_rf_scoped_asks(self):
        self.assertEqual(bash("rm -rf build/")[0], "ask")

    def test_secret_read_asks(self):
        self.assertEqual(bash("cat .env")[0], "ask")

    # allow (the common case stays frictionless)
    def test_normal_bash_allowed(self):
        self.assertEqual(bash("git status")[0], "allow")
        self.assertEqual(bash("npm test")[0], "allow")

    def test_normal_write_allowed(self):
        self.assertEqual(write("src/auth/core.py")[0], "allow")

    def test_unknown_tool_allowed(self):
        self.assertEqual(evaluate("Read", {"file_path": ".env"})[0], "allow")  # reads aren't blocked here


if __name__ == "__main__":
    unittest.main()
