from __future__ import annotations

import json
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from backend.distill_insight.handler import lambda_handler as distill_handler
from backend.notify_donor.handler import lambda_handler as notify_handler
from backend.saathi_chat.handler import lambda_handler as chat_handler
from backend.shared.memory import parse_json_object, validate_insight


class NotificationBackendTest(unittest.TestCase):
    def setUp(self) -> None:
        self.donor = SimpleNamespace(
            donor_id="donor-123",
            blood_group="O Positive",
            donor_type="Regular Donor",
            eligibility_status="eligible",
            next_eligible_date=date(2025, 8, 20),
            donations_till_date=8,
            calls_to_donations_ratio=0.9,
            total_calls=10,
            active_status="Active",
        )
        self.patient = SimpleNamespace(
            patient_id="patient-456",
            blood_group="O Positive",
            quantity_required=1,
            expected_next_transfusion_date=date(2025, 8, 19),
            frequency_in_days=18,
        )
        self.valid_insight = {
            "donor_id": "donor-123",
            "engagement_state": "warm",
            "preferred_channel": "whatsapp",
            "preferred_language": "en",
            "preferred_time_window": "evening",
            "name_used": "Priya",
            "last_refusal_reason": None,
            "last_refusal_expires_at": None,
            "lifetime_donations": 8,
            "patient_bond": "Has asked about Aarav before",
            "what_motivates": ["impact updates"],
            "what_to_avoid": ["formal language"],
            "summary_120w": "Warm donor who prefers concise messaging.",
            "updated_at": "2025-08-17T12:00:00Z",
        }

    def test_validate_insight_accepts_valid_shape(self) -> None:
        self.assertEqual(validate_insight(dict(self.valid_insight)), self.valid_insight)

    def test_parse_json_object_removes_code_fence(self) -> None:
        parsed = parse_json_object("```json\n{\"donor_id\":\"abc\"}\n```")
        self.assertEqual(parsed["donor_id"], "abc")

    @patch("backend.notify_donor.handler.append_conversation_turn")
    @patch("backend.notify_donor.handler.invoke")
    @patch("backend.notify_donor.handler.load_prompt")
    @patch("backend.notify_donor.handler.get_donor_insight")
    @patch("backend.notify_donor.handler.get_repository")
    def test_notify_donor_generates_message(
        self,
        repository_mock,
        insight_mock,
        prompt_mock,
        invoke_mock,
        append_mock,
    ) -> None:
        repository_mock.return_value.donor.return_value = self.donor
        repository_mock.return_value.patient.return_value = self.patient
        insight_mock.return_value = self.valid_insight
        prompt_mock.return_value = "prompt"
        invoke_mock.return_value = {"text": "hello donor", "usage": {"input_tokens": 1}, "model_id": "model"}
        append_mock.return_value = {"donor_id": "donor-123", "ts": "2025-08-17T12:00:00Z", "text": "hello donor"}

        result = notify_handler(
            {"body": json.dumps({"donor_id": "donor-123", "patient_id": "patient-456", "trigger": "approval"})},
            None,
        )
        body = json.loads(result["body"])

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["message"], "hello donor")
        self.assertEqual(body["channel"], "whatsapp")

    @patch("backend.distill_insight.handler.get_donor_insight")
    @patch("backend.distill_insight.handler.invoke")
    @patch("backend.distill_insight.handler.load_prompt")
    @patch("backend.distill_insight.handler.get_conversations")
    @patch("backend.distill_insight.handler.get_repository")
    def test_distill_insight_rejects_invalid_json(
        self,
        repository_mock,
        conversations_mock,
        prompt_mock,
        invoke_mock,
        existing_mock,
    ) -> None:
        repository_mock.return_value.donor.return_value = self.donor
        conversations_mock.return_value = []
        prompt_mock.return_value = "prompt"
        invoke_mock.return_value = {"text": "not json", "usage": {}, "model_id": "model"}
        existing_mock.return_value = None

        result = distill_handler({"donor_id": "donor-123"}, None)
        body = json.loads(result["body"])

        self.assertEqual(result["statusCode"], 500)
        self.assertIn("error", body)

    @patch("backend.saathi_chat.handler.append_conversation_turn")
    @patch("backend.saathi_chat.handler.invoke")
    @patch("backend.saathi_chat.handler.load_prompt")
    @patch("backend.saathi_chat.handler.get_conversations")
    @patch("backend.saathi_chat.handler.get_donor_insight")
    @patch("backend.saathi_chat.handler.get_repository")
    def test_chat_open_returns_opener(
        self,
        repository_mock,
        insight_mock,
        conversations_mock,
        prompt_mock,
        invoke_mock,
        append_mock,
    ) -> None:
        repository_mock.return_value.donor.return_value = self.donor
        insight_mock.return_value = self.valid_insight
        conversations_mock.return_value = [{"donor_id": "donor-123", "ts": "1", "role": "user", "text": "hi"}]
        prompt_mock.return_value = "prompt"
        invoke_mock.return_value = {"text": "opening message", "usage": {}, "model_id": "model"}
        append_mock.return_value = {}

        result = chat_handler(
            {"rawPath": "/saathi/chat/open", "requestContext": {"http": {"method": "GET"}}, "queryStringParameters": {"donor_id": "donor-123"}},
            None,
        )
        body = json.loads(result["body"])

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["opening_message"], "opening message")

    @patch("backend.saathi_chat.handler.maybe_trigger_distill_async")
    @patch("backend.saathi_chat.handler.append_conversation_turn")
    @patch("backend.saathi_chat.handler.invoke")
    @patch("backend.saathi_chat.handler.load_prompt")
    @patch("backend.saathi_chat.handler.get_conversations")
    @patch("backend.saathi_chat.handler.get_donor_insight")
    @patch("backend.saathi_chat.handler.get_repository")
    def test_chat_turn_persists_reply(
        self,
        repository_mock,
        insight_mock,
        conversations_mock,
        prompt_mock,
        invoke_mock,
        append_mock,
        distill_mock,
    ) -> None:
        repository_mock.return_value.donor.return_value = self.donor
        insight_mock.return_value = self.valid_insight
        conversations_mock.return_value = [{"donor_id": "donor-123", "ts": "1", "role": "user", "text": "hello"}]
        prompt_mock.return_value = "prompt"
        invoke_mock.return_value = {"text": "reply text", "usage": {}, "model_id": "model"}
        append_mock.side_effect = [
            {"donor_id": "donor-123", "ts": "1", "role": "user", "text": "hello"},
            {"donor_id": "donor-123", "ts": "2", "role": "saathi", "text": "reply text"},
        ]

        result = chat_handler(
            {
                "rawPath": "/saathi/chat/turn",
                "requestContext": {"http": {"method": "POST"}},
                "body": json.dumps({"donor_id": "donor-123", "text": "hello", "language": "en"}),
            },
            None,
        )
        body = json.loads(result["body"])

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["text"], "reply text")
        distill_mock.assert_called_once_with("donor-123")


if __name__ == "__main__":
    unittest.main()
