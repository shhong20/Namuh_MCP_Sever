import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("broker_auth_audit.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def row(**data):
    return json.dumps({"MESSAGE": json.dumps(data)})

class AuditTest(unittest.TestCase):
    def test_anomalies_and_redaction(self):
        rows = ([row(broker="NH", event="issue_attempt")]*4 +
                [row(broker="NH", event="revoked")]*2 +
                [row(broker="NH", event="outbound", origin="https://outside.invalid/?secret=TEST_SECRET"),
                 row(broker="NH", event="outbound", origin="https://api.nhplug.com:8443"),
                 row(broker="KIS", event="issued"),"malformed"])
        result = audit.summarize(rows,"NH",audit.BROKERS["NH"][1])
        self.assertEqual(result["unexpected_destination_count"],1)
        self.assertEqual(len(result["alerts"]),4)
        self.assertNotIn("TEST_SECRET",json.dumps(result))
        self.assertNotIn("outside.invalid",json.dumps(result))

    def test_private_storage(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/"audit"
            audit.save_report({"test":True},root)
            f=next(root.glob("*.json"))
            self.assertEqual(root.stat().st_mode&0o777,0o700)
            self.assertEqual(f.stat().st_mode&0o777,0o600)

    def test_empty_logs_not_fabricated(self):
        result=audit.summarize([],"NH",audit.BROKERS["NH"][1])
        self.assertEqual(result["parsed_events"],0)
        self.assertEqual(result["counts"],{})

if __name__=="__main__":
    unittest.main()
