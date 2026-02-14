PORT ?= /dev/ttyUSB0
FQBN ?= esp32:esp32:esp32
UPLOAD_SPEED ?= 115200
BUILD_PATH ?= .build
BOARD_OPTIONS ?= PartitionScheme=huge_app
TOOL ?=

# Allow: make compile <tool>, make upload <tool>, make monitor <tool>
ifeq ($(TOOL),)
ifneq ($(filter compile upload monitor,$(firstword $(MAKECMDGOALS))),)
TOOL := $(word 2,$(MAKECMDGOALS))
ifneq ($(TOOL),)
$(eval $(TOOL):;@:)
endif
endif
endif

SKETCH_PATH := $(if $(TOOL),./tools/$(TOOL),./)
BUILD_DIR := $(if $(TOOL),$(BUILD_PATH)/$(TOOL),$(BUILD_PATH)/main)

.PHONY: compile upload monitor flash

compile:
	arduino-cli compile --fqbn $(FQBN) --board-options $(BOARD_OPTIONS) --build-path $(BUILD_DIR) $(SKETCH_PATH)

upload: compile
	arduino-cli upload -p $(PORT) --fqbn $(FQBN) --build-path $(BUILD_DIR) --upload-property upload.speed=$(UPLOAD_SPEED) $(SKETCH_PATH)

monitor:
	@echo "Monitoring serial on $(PORT) ($(if $(TOOL),tool: $(TOOL),main sketch))"
	arduino-cli monitor -p $(PORT) --fqbn $(FQBN) --config baudrate=115200

flash: upload
