"""SonogeneticChannel — a generated biomolecule cast as an ultrasound-gated channel.

A generated molecule is a sequence/structure; to *test it on the connectome* it needs an
ultrasound-sensitivity value (→ sono-write gain) and a target neuron population. The
sequence→sensitivity map here is an explicit, transparent **placeholder proxy** from
composition — NOT a validated biophysical predictor. It is deterministic so results are
reproducible, and it lets different generated molecules produce different, comparable
effects when tested.
"""

from __future__ import annotations

from dataclasses import dataclass

HYDROPHOBIC = set("AILMFWVY")          # residues that favor membrane insertion
_AROMATIC = set("cnops")               # lowercase aromatic atoms in SMILES


def _protein_feature(seq: str) -> float:
    letters = [c for c in seq.upper() if c.isalpha()]
    if not letters:
        return 0.0
    return sum(c in HYDROPHOBIC for c in letters) / len(letters)


def _smiles_feature(seq: str) -> float:
    if not seq:
        return 0.0
    aromatic = sum(c in _AROMATIC for c in seq)
    rings = sum(c.isdigit() for c in seq)
    return min(1.0, (aromatic + rings) / max(len(seq), 1) * 3.0)


def sensitivity_proxy(sequence: str, modality: str) -> float:
    """Modeled ultrasound sensitivity in [0.2, 0.85] (placeholder proxy)."""
    kind_protein = modality in ("protein", "peptide")
    f = _protein_feature(sequence) if kind_protein else _smiles_feature(sequence)
    return round(0.2 + 0.65 * max(0.0, min(1.0, f)), 3)


@dataclass
class SonogeneticChannel:
    """A candidate channel derived from a generated biomolecule."""

    id: str
    sequence: str
    modality: str
    sensitivity: float          # modeled ultrasound sensitivity (proxy), 0..1
    target: str = "rev"         # neuron population that expresses it (a ROLE key)

    @classmethod
    def from_sequence(cls, seq: str, modality: str, idx: int, target: str = "rev") -> "SonogeneticChannel":
        return cls(
            id=f"{modality[:3]}-{idx:03d}",
            sequence=seq,
            modality=modality,
            sensitivity=sensitivity_proxy(seq, modality),
            target=target,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "sequence": self.sequence, "modality": self.modality,
            "sensitivity": self.sensitivity, "target": self.target,
        }
