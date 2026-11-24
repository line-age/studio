"""What the model is told when code sent its draft back. Reviewed like code: a change
here needs an eval run before and after."""

RETRY = """\
Your answer could not be shown, because code checked it and found:

{problems}

Write the whole answer again, fixing these. Read store again if you need to.\
"""
