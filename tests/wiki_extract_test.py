import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('extract', Path(__file__).resolve().parents[1] / 'tools/wiki-extract.py')
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class WikiExtractionTests(unittest.TestCase):
    def test_xml_preserves_revision_and_wikitext(self):
        xml = '''<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/"><page><title>Fixture</title><id>3</id><revision><id>42</id><timestamp>2026-10-06T00:00:00Z</timestamp><text>== Rules ==\n[[Pilot]]</text><sha1>abc</sha1></revision></page></mediawiki>'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'export.xml'
            path.write_text(xml)
            pages = list(extract.xml_pages(path))
        self.assertEqual(pages[0]['pageid'], 3)
        self.assertEqual(pages[0]['revisions'][0]['revid'], 42)
        self.assertEqual(pages[0]['revisions'][0]['slots']['main']['content'], '== Rules ==\n[[Pilot]]')

    def test_category_continuation_and_cycles(self):
        responses = [
            {'query': {'categorymembers': [{'ns': 0, 'title': 'First'}, {'ns': 14, 'title': 'Category:Child'}]}, 'continue': {'cmcontinue': 'next', 'continue': '-||'}},
            {'query': {'categorymembers': [{'ns': 0, 'title': 'Second'}, {'ns': 6, 'title': 'File:Ignored'}]}},
            {'query': {'categorymembers': [{'ns': 0, 'title': 'Third'}, {'ns': 14, 'title': 'Category:Root'}]}}
        ]
        with patch.object(extract, 'request', side_effect=responses) as request, patch.object(extract.time, 'sleep'):
            self.assertEqual(extract.discover('Category:Root'), {'First', 'Second', 'Third'})
            self.assertEqual(request.call_count, 3)
            self.assertEqual(request.call_args_list[1].args[0]['cmcontinue'], 'next')

    def test_snapshot_save_is_readable_and_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'subdir/snapshot.json'
            extract.save(path, {'title': 'Twi\u0027lek'})
            self.assertEqual(extract.json.loads(path.read_text())['title'], "Twi'lek")
            self.assertFalse(path.with_suffix('.tmp').exists())
