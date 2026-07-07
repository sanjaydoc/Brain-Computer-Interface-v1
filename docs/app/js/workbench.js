// Shared workbench state, so the pipeline tabs feed each other:
//   Biomolecules/Physics → channel · Waves → wave · Electronics → circuit ·
//   Hardware → enclosure (+STL) · Fusion → experiment results · 3D printing → the STL.
export const WB = {
  channel: null,     // { id, sequence, sign, sensitivity, conductance }
  wave: null,        // { form, freq, pressure, sign }
  circuit: null,     // { title, components, connections, bom }
  enclosure: null,   // { kind, w, h, d, wall, stl, name }
  results: [],       // Fusion experiment rows
};
