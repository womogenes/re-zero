SKETCH ?= drone
PORT ?= /dev/ttyUSB0
FQBN ?= esp32:esp32:esp32
UPLOAD_SPEED ?= 921600
BUILD_PATH ?= .build
BOARD_OPTIONS ?= PartitionScheme=huge_app

.PHONY: compile upload monitor flash

compile:
	arduino-cli compile --fqbn $(FQBN) --board-options $(BOARD_OPTIONS) --build-path $(BUILD_PATH)/$(SKETCH) ./$(SKETCH)

upload:
	arduino-cli upload -p $(PORT) --fqbn $(FQBN) --build-path $(BUILD_PATH)/$(SKETCH) --upload-property upload.speed=$(UPLOAD_SPEED) ./$(SKETCH)

monitor:
	arduino-cli monitor -p $(PORT) --fqbn $(FQBN) --config baudrate=921600

flash: upload

