## Synth command

time vivado -mode batch -source build.tcl -nojournal -log "obj/vivado.log"

## Flash command

openFPGALoader -b genesys2 obj/final.bit
openFPGALoader -b genesys2 obj_ken/final.bit