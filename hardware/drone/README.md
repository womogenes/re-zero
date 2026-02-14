# Drone

Drone model: https://the50offstore.com/all-products/ols/products/pioneer-professional-quadcopter-drone-model-1812

Setup:

- We have an ESP32 and a Pioneer Professional Quadcopter Drone Model 1812, with its controller.
- The drone communicates with the controller.
- A photo of the drone board is stored in drone/drone_board.jpg. The primary controller is labeled TLSR8232 / F512ET32 / ZQZ2126 / DQ6062.
- A photo of the controller board is in drone/controller_front.jpg and drone/controller_back.jpg. The controller has a 16-pin IC labeled 2312CTa.
- The hardware we have is: an ESP32, wires, resistors, breadboard, capacitor, nothing else. We are unable to obtain additional hardware.

We would like to reverse engineer the controller protocol with the goal of creating a bespoke controller and getting sensor information from the drone.

You may ask me to visually inspect the board and answer questions about it.
