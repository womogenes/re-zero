`default_nettype none

module top_level_tdc (
    input wire sysclk_p,
    input wire sysclk_n,
    input wire esp_clk_gpio,

    input wire [4:0] btn,
    input wire [7:0] sw,
    output logic [7:0] led,
    input wire esp_trigger_gpio
);
    logic rst;
    assign rst = btn[0];
    logic btn_down_raw;
    assign btn_down_raw = btn[1];
    logic btn_up_raw;
    assign btn_up_raw = btn[4];
    logic debug_mode;
    assign debug_mode = sw[0];  // 1 = debug, 0 = normal
    logic [7:0] debug_counter;
    
    // only for theta
    logic do_inc;
    button_trigger up(
        .clk(sysclk_200mhz_passthrough),
        .sys_rst(rst),
        .signal(btn_up_raw),
        .clean_signal(do_inc)
    );
    logic do_dec;
    button_trigger down(
        .clk(sysclk_200mhz_passthrough),
        .sys_rst(rst),
        .signal(btn_down_raw),
        .clean_signal(do_dec)
    );
    logic locked_theta;
    logic theta_pulse;
    assign theta_pulse = (do_inc || do_dec) && locked_theta;
    logic theta_dir;
    assign theta_dir = do_inc; 

    always_ff @(posedge sysclk_200mhz_passthrough) begin
        if (rst) begin
            debug_counter <= 0;
        end
        else if (theta_pulse) begin
            debug_counter <= theta_dir ? debug_counter + 1 : debug_counter - 1;
        end
    end


    logic sysclk_200mhz_passthrough;
    logic clk_launch, clk_capture;
    logic locked_phi;
    clk_wiz clk_inst (
        .sysclk_p(sysclk_p),
        .sysclk_n(sysclk_n),
        .esp_clk_gpio(esp_clk_gpio),

        .sysclk_200mhz_passthrough(sysclk_200mhz_passthrough),
        .clk_240mhz(clk_launch),
        .clk_capture(clk_capture),

        // phi tuning (ESP sync)
        .phi_ps_clk(sysclk_200mhz_passthrough),
        .phi_ps_en(0),
        .phi_ps_incdec(0),
        .phi_ps_done(),
        .phi_ready(locked_phi),

        // theta turning (sensor callibration)
        .theta_ps_clk(sysclk_200mhz_passthrough),
        .theta_ps_en(theta_pulse),
        .theta_ps_incdec(theta_dir),
        .theta_ps_done(),
        .theta_ready(locked_theta),

        .rst(rst)
    );

    logic esp_trigger;
    IBUF esp_trigger_buf_inst (
        .I(esp_trigger_gpio),
        .O(esp_trigger)
    );
    logic [63:0] tdc_data;
    logic data_valid;
    (* DONT_TOUCH = "TRUE" *)
    tdc_sensor tdc_sensor_inst(
        .clk_launch(clk_launch),    
        .clk_capture(clk_capture),
        .rst(rst),
        
        .esp_trigger(esp_trigger),
        
        .tdc_data(tdc_data),  // to UART
        .data_valid(data_valid)
    );

    always_comb begin
        if (rst) begin
            led[7:0] = 8'b1111_1111;
        end
        else if (!debug_mode) begin
            // LED 0: System Health (Must be ON = MMCM Locked)
            led[0] = locked_phi && locked_theta; 
            
            // LED 1: Trigger Activity (Flickers if ESP32 is working)
            led[1] = data_valid;

            // LEDs 2-7: THE WIDE NET
            // We sample every ~10th bit to see the entire 64-bit line at once.
            // This acts like a progress bar.
            led[7] = tdc_data[0];   // Start of delay line (LSB)
            led[6] = tdc_data[11];
            led[5] = tdc_data[23];
            led[4] = tdc_data[35];  // Middle of delay line
            led[3] = tdc_data[47];
            led[2] = tdc_data[59];  // End of delay line (MSB)
        end else begin
            led[7:0] = debug_counter;
        end
    end
endmodule
`default_nettype wire
