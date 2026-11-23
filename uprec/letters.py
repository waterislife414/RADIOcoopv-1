class SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"

def render_letter(template_text: str, owner_dict: dict, properties_list: list) -> str:
    """
    Renders an outreach letter using template_text with owner details and formatted properties.
    """
    # Build a context dictionary combining owner fields and summary properties
    context = dict(owner_dict)
    
    # Format properties summary if needed
    props_summary = "\n".join(
        f"- {p.get('holder', 'Unknown Holder')}: {p.get('property_type', 'Property')} ({p.get('amount_text', 'Amount unknown')})"
        for p in properties_list
    )
    context['properties_list'] = props_summary
    context['property_count'] = len(properties_list)

    return template_text.format_map(SafeDict(context))
