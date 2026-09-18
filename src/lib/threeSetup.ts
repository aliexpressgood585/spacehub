import { ColorManagement } from 'three'

// Side-effect module: importing it configures three the way our scenes expect.
//
// Our 3D scenes hand-pick hex colours that were tuned before three r152 turned
// colour management on by default. Leaving it on re-interprets those literals
// as sRGB and visibly dulls every scene.
//
// This deliberately lives beside the 3D components rather than in main.tsx.
// Importing three from the entry point pulls its ~700 KB into the critical
// path of *every* page, including ones with no 3D at all; imported only from
// lazily-loaded scenes, it stays in their chunk.
ColorManagement.enabled = false
