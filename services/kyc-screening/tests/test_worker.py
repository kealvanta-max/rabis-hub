import hashlib
import hmac
import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SCREENING_SHARED_SECRET", "test-secret-that-is-long-enough")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "demo")
from app.main import ScreenRequest, allowed_url, canonical, check_image, mrz_check_digit, parse_td1


class WorkerGuardrailTests(unittest.TestCase):
    def test_canonical_payload_is_stable(self):
        self.assertEqual(canonical({"b": 2, "a": 1}), b'{"a":1,"b":2}')

    def test_url_requires_https_and_exact_cloudinary_host(self):
        self.assertTrue(allowed_url("https://res.cloudinary.com/demo/image/upload/file.jpg"))
        self.assertFalse(allowed_url("http://res.cloudinary.com/demo/file.jpg"))
        self.assertFalse(allowed_url("https://res.cloudinary.com.attacker.example/a"))
        self.assertFalse(allowed_url("https://user@res.cloudinary.com/demo/a"))

    def test_td1_check_digits_are_validated(self):
        doc = "123456789"
        line1 = "I<GHA" + doc + str(mrz_check_digit(doc)) + "<" * 15
        dob = "900101"
        expiry = "300101"
        line2_prefix = dob + str(mrz_check_digit(dob)) + "M" + expiry + str(mrz_check_digit(expiry)) + "GHA" + "<" * 11
        composite = line1[5:30] + line2_prefix[0:7] + line2_prefix[8:15] + line2_prefix[18:29]
        line2 = line2_prefix + str(mrz_check_digit(composite))
        parsed = parse_td1("\n".join([line1, line2, "DOE<<JANE".ljust(30, "<")]))
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[1], "valid")
        bad = line1[:14] + str((int(line1[14]) + 1) % 10) + line1[15:]
        self.assertEqual(parse_td1("\n".join([bad, line2, "DOE<<JANE".ljust(30, "<")]))[1], "checksum-mismatch")

    def test_corrupt_image_is_not_a_pass(self):
        result, _ = check_image(b"not an image", "selfie", "image/jpeg")
        self.assertEqual(result.status, "fail")
        self.assertIn("invalid-image", result.reasons)

    def test_schema_rejects_fake_hash_and_unknown_purpose(self):
        common = {"submissionId": "submission_123", "caseId": "case", "sessionId": "s" * 16,
                  "createdAt": 1, "expiresAt": 2}
        with self.assertRaises(Exception):
            ScreenRequest.model_validate({**common, "evidence": [{"purpose": "selfie", "deliveryUrl": "https://res.cloudinary.com/x", "sha256": "fake", "mime": "image/jpeg", "bytes": 12}]})
        with self.assertRaises(Exception):
            ScreenRequest.model_validate({**common, "evidence": [{"purpose": "unknown", "deliveryUrl": "https://res.cloudinary.com/x", "sha256": "0" * 64, "mime": "image/jpeg", "bytes": 12}]})


if __name__ == "__main__":
    unittest.main()
