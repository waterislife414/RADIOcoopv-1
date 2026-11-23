import pytest
from uprec.columns import load_column_map, norm_header, build_header_map, map_row


def test_norm_header():
    assert norm_header("  Owner Name! ") == "owner name"
    assert norm_header("Zip-Code?") == "zip code"
    assert norm_header("") == ""


def test_load_and_build_map():
    colmap = load_column_map()
    assert "canonical" in colmap
    headers = ["Owner Name", "Zip Code", "Reported By", "Date Reported", "Unknown Header"]
    hmap = build_header_map(headers, colmap)
    assert hmap["Owner Name"] == "owner_name"
    assert hmap["Zip Code"] == "zip"
    assert hmap["Reported By"] == "holder"
    assert hmap["Date Reported"] == "reported"
    assert "Unknown Header" not in hmap


def test_map_row_standard():
    colmap = load_column_map()
    headers = ["Owner Name", "Zip"]
    hmap = build_header_map(headers, colmap)
    row = {"Owner Name": "ACME INC", "Zip": "36867"}
    mapped = map_row(row, hmap, colmap)
    assert mapped["owner_name"] == "ACME INC"
    assert mapped["zip"] == "36867"
    assert mapped["city"] == ""


def test_map_row_name_join():
    colmap = load_column_map()
    headers = ["First Name", "Last Name", "City"]
    hmap = build_header_map(headers, colmap)
    row = {"First Name": "John", "Last Name": "Doe", "City": "Phenix City"}
    mapped = map_row(row, hmap, colmap)
    assert mapped["owner_name"] == "DOE JOHN"
    assert mapped["city"] == "Phenix City"
