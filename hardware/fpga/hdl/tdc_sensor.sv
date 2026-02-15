// Inspired by https://kastner.ucsd.edu/wp-content/uploads/2023/01/admin/isfpga23-turnon.pdf.
// See Figure 3.

`default_nettype none

module tdc_sensor (
    input  wire clk_launch,    
    input  wire clk_capture,
    input  wire rst,
    
    input  wire esp_trigger,  // signal high when aes_encryption is running for better reading
    
    output logic [63:0] tdc_data,
    output logic        data_valid
);
    // 1. THE PULSE GENERATOR (Internal to FPGA)
    // NOTE: pulse generator produces positive and negative pulse edges, running on the launch Clock
    // NOTE: (see Section 3 TUNABLE DUAL-POLARITY TDC)
    logic pulse_r;
    always @(posedge clk_launch) begin
        if (rst) 
            pulse_r <= 1'b0;
        else 
            pulse_r <= ~pulse_r;
    end

    // 2. THE DELAY LINE (Sensor)
    logic [63:0] carry_chain_taps;

    CARRY4 tdc_stage_0 (
        .CO     (carry_chain_taps[3:0]), 
        .O      (),                   
        .CI     (1'b0),               
        .CYINIT (pulse_r),
        .DI     (4'b0000),            
        .S      (4'b1111)             
    );
    genvar i;
    generate
        for (i = 1; i < 16; i = i + 1) begin : tdc_chain
            CARRY4 tdc_stage_i (
                .CO     (carry_chain_taps[4*i +: 4]), 
                .O      (),
                .CI     (carry_chain_taps[4*i - 1]),   
                .CYINIT (1'b0),
                .DI     (4'b0000),
                .S      (4'b1111)
            );
        end
    endgenerate

    // 3. CAPTURE LOGIC (Snapshot)
    always @(posedge clk_capture) begin
        if (rst) begin
            data_valid <= 1'b0;
            tdc_data   <= 64'b0;
        end else begin
            if (esp_trigger) begin
                tdc_data   <= carry_chain_taps;
                data_valid <= 1'b1;
            end else begin
                data_valid <= 1'b0;
            end
        end
    end

endmodule

`default_nettype wire