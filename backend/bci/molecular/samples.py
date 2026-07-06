"""Bundled fallback biomolecules — real, valid sequences used when neither a local
De-Novo-LLM checkpoint nor an NVIDIA NIM key is available (e.g. the hosted web demo, CI).
Lets the Generate button always return something plausible.
"""

FALLBACK = {
    "smiles": [
        "CC(=O)Oc1ccccc1C(=O)O",            # aspirin
        "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",     # caffeine
        "CC(C)Cc1ccc(cc1)C(C)C(=O)O",       # ibuprofen
        "c1ccc2c(c1)cccc2",                 # naphthalene
        "Oc1ccc(cc1)CCN",                   # tyramine
        "C1CCNCC1",                         # piperidine
        "c1ccncc1",                         # pyridine
        "CCOC(=O)c1ccccc1N",                # benzocaine
    ],
    "protein": [
        "GIGAVLKVLTTGLPALISWIKRKRQQ",       # melittin
        "FLPIIAKLLGGLL",                    # a short amphipathic peptide
        "MKTAYIAKQRQISFVKSHFSRQLEERLGL",
        "GLFDIVKKVVGALGSL",                 # magainin-like
        "KWKLFKKIEKVGQNIRDGIIKAGPAVAVVGQATQIAK",  # LL-37-like
        "ACDEFGHIKLMNPQRSTVWY",             # all-residue probe
    ],
    "dna": [
        "ATGGCCTTAAGGCTAGCTAGGCTTAA",
        "GGCCAATTGGCCTTAAGGCCAATTGG",
        "ATATCGCGATCGATCGTAGCTAGCTA",
    ],
}
FALLBACK["peptide"] = FALLBACK["protein"]
FALLBACK["rna"] = [s.replace("T", "U") for s in FALLBACK["dna"]]
FALLBACK["selfies"] = FALLBACK["smiles"]
