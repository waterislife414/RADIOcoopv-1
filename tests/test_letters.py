from uprec.letters import render_letter


def test_render_letter():
    template = "Dear {name}, we found {property_count} properties for you at:\n{properties_list}"
    owner = {"name": "ZZ TESTPERSON ALPHA"}
    properties = [
        {"holder": "Example Life Insurance Co", "property_type": "Life insurance proceeds", "amount_text": "over $500"}
    ]
    
    result = render_letter(template, owner, properties)
    assert "ZZ TESTPERSON ALPHA" in result
    assert "Example Life Insurance Co" in result
    assert "over $500" in result
from uprec.letters import render_letter


def test_render_letter():
    template = "Dear {name}, we found {property_count} properties for you at:\n{properties_list}"
    owner = {"name": "ZZ TESTPERSON ALPHA"}
    properties = [
        {"holder": "Example Life Insurance Co", "property_type": "Life insurance proceeds", "amount_text": "over $500"}
    ]
    
    result = render_letter(template, owner, properties)
    assert "ZZ TESTPERSON ALPHA" in result
    assert "Example Life Insurance Co" in result
    assert "over $500" in result
