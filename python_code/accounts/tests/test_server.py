"""Tests for the parts that matter once the site runs on a server."""

import os
import tempfile
from io import StringIO
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

PASSWORD = "ledger-Pages-42"


class HealthTests(TestCase):
    def test_health_needs_no_login(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_answers_even_for_a_host_name_the_site_does_not_accept(self):
        # The host's own check arrives from inside its network.
        response = self.client.get("/api/health/", HTTP_HOST="10.20.30.40:10000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/books/", HTTP_HOST="10.20.30.40:10000").status_code, 400)

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_health_is_not_redirected_to_https(self):
        self.assertEqual(self.client.get("/api/health/").status_code, 200)
        self.assertEqual(self.client.get("/api/books/").status_code, 301)


class ScreensTests(TestCase):
    def test_every_page_address_gets_the_screens(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "index.html").write_text("<html>booklet screens</html>")
            with override_settings(FRONTEND_DIST=Path(folder)):
                for address in ("/", "/sign-in", "/books/3", "/books/3/read", "/trash"):
                    response = self.client.get(address)
                    self.assertEqual(response.status_code, 200, address)
                    self.assertIn(b"booklet screens", response.content)
                    self.assertEqual(response["Cache-Control"], "no-cache")

    def test_api_addresses_are_not_swallowed_by_the_screens(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "index.html").write_text("<html>booklet screens</html>")
            with override_settings(FRONTEND_DIST=Path(folder)):
                self.assertEqual(self.client.get("/api/books/").status_code, 401)
                self.assertEqual(self.client.get("/api/no-such-thing/").status_code, 404)

    def test_clear_message_when_the_screens_are_not_built(self):
        with tempfile.TemporaryDirectory() as folder:
            with override_settings(FRONTEND_DIST=Path(folder)):
                response = self.client.get("/")
                self.assertEqual(response.status_code, 503)
                self.assertIn(b"npm run build", response.content)


class EnsureAdminTests(TestCase):
    def run_command(self, **env):
        out = StringIO()
        with mock.patch.dict(os.environ, env, clear=False):
            for name in ("BOOKLET_ADMIN_USERNAME", "BOOKLET_ADMIN_PASSWORD"):
                if name not in env:
                    os.environ.pop(name, None)
            call_command("ensure_admin", stdout=out)
        return out.getvalue()

    def test_creates_the_first_admin(self):
        output = self.run_command(BOOKLET_ADMIN_USERNAME="owner", BOOKLET_ADMIN_PASSWORD=PASSWORD)
        self.assertIn("Created", output)
        owner = User.objects.get(username="owner")
        self.assertTrue(owner.is_booklet_admin)
        self.assertTrue(owner.check_password(PASSWORD))

    def test_does_nothing_when_an_admin_exists(self):
        User.objects.create_superuser("boss", password=PASSWORD)
        output = self.run_command(BOOKLET_ADMIN_USERNAME="owner", BOOKLET_ADMIN_PASSWORD="another-Pass-77")
        self.assertIn("already exists", output)
        self.assertFalse(User.objects.filter(username="owner").exists())
        self.assertTrue(User.objects.get(username="boss").check_password(PASSWORD))

    def test_says_what_is_missing(self):
        output = self.run_command()
        self.assertIn("BOOKLET_ADMIN_USERNAME", output)
        self.assertEqual(User.objects.count(), 0)

    def test_does_not_take_over_an_ordinary_users_name(self):
        User.objects.create_user("ravi", password=PASSWORD)
        output = self.run_command(BOOKLET_ADMIN_USERNAME="ravi", BOOKLET_ADMIN_PASSWORD="another-Pass-77")
        self.assertIn("already used", output)
        self.assertFalse(User.objects.get(username="ravi").is_booklet_admin)


class LoginLimitTests(APITestCase):
    def test_too_many_sign_in_tries_are_slowed_down(self):
        User.objects.create_user("ravi", password=PASSWORD)
        cache.clear()
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"login": "3/min"}):
            statuses = [
                self.client.post("/api/auth/login/", {"username": "ravi", "password": "wrong"}).status_code
                for _ in range(5)
            ]
        cache.clear()
        self.assertEqual(statuses, [400, 400, 400, 429, 429])
