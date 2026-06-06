from __future__ import annotations

import json
import unittest
from datetime import date

from backend.forecast.handler import lambda_handler as forecast_handler
from backend.rank_donors.handler import lambda_handler as rank_handler
from backend.shared.ranking import blood_group_compatible, haversine_km
from backend.shared.repository import get_repository


class BackendLogicTest(unittest.TestCase):
    def test_repository_maps_dataset(self) -> None:
        repository = get_repository()
        self.assertGreater(len(repository.patients()), 0)
        self.assertGreater(len(repository.donors()), 0)

    def test_forecast_returns_dataset_relevant_window(self) -> None:
        response = forecast_handler(
            {"queryStringParameters": {"anchor_date": "2025-08-17", "window": "14"}},
            None,
        )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertGreater(len(body["items"]), 0)

    def test_rank_donors_for_forecast_patient(self) -> None:
        forecast_response = forecast_handler(
            {"queryStringParameters": {"anchor_date": "2025-08-17", "window": "14"}},
            None,
        )
        patient_id = json.loads(forecast_response["body"])["items"][0]["patient_id"]
        response = rank_handler(
            {"queryStringParameters": {"patient_id": patient_id, "anchor_date": "2025-08-17", "limit": "5"}},
            None,
        )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertLessEqual(len(body["items"]), 5)

    def test_blood_compatibility(self) -> None:
        self.assertTrue(blood_group_compatible("O Negative", "AB Positive"))
        self.assertFalse(blood_group_compatible("AB Positive", "O Positive"))

    def test_haversine_zero_distance(self) -> None:
        self.assertEqual(haversine_km(17.3922792, 78.4602749, 17.3922792, 78.4602749), 0)


if __name__ == "__main__":
    unittest.main()
