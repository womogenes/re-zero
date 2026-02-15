// NOTE: Kintex-7 MMCM allows you to change the phase of a clock while the chip is running by increments of about 18 ps
module clk_wiz (
    input   sysclk_p,                  
    input   sysclk_n,     
    input   esp_clk_gpio,      
    output  sysclk_200mhz_passthrough,
    output  clk_240mhz,

    input   phi_ps_clk,
    input   phi_ps_en,
    input   phi_ps_incdec,
    output  phi_ps_done,

    input   theta_ps_clk,
    input   theta_ps_en,
    input   theta_ps_incdec,
    output  theta_ps_done,

    input   rst,
    output  phi_ready,
    output  theta_ready,

    output  clk_capture
);

  wire sysclk_200mhz_inst;
  wire clk_240mhz_inst;

  // ** make clocks
  IBUFDS #(
      .DIFF_TERM   ("FALSE"), 
      .IBUF_LOW_PWR("TRUE"),     
      .IOSTANDARD  ("LVDS")
  ) IBUFDS_inst (
      .O           (sysclk_200mhz_inst),
      .I           (sysclk_p),
      .IB          (sysclk_n)
  );
  wire esp_clk;
  IBUF esp_clk_buf_inst (  // needed since external
    .I(esp_clk_gpio),
    .O(esp_clk)
  );
  
  // MMCM 1: phase phi clock for target and sensor (align with esp)
  wire clk_phi_fb_out, clk_phi_fb_in;
  MMCME2_ADV #(
    .BANDWIDTH("OPTIMIZED"),
    .CLKOUT4_CASCADE("FALSE"),
    .COMPENSATION("ZHOLD"),
    .STARTUP_WAIT("FALSE"),
    
    // VCO CONFIGURATION (sensitivity)
    .DIVCLK_DIVIDE(1),
    .CLKFBOUT_MULT_F(30.000),    // 40 MHz * 30.000 = 1200 MHz (class -2 FPGA can handle more resolution, but use this for now)
    .CLKFBOUT_PHASE(0.000),
    .CLKFBOUT_USE_FINE_PS("FALSE"),
    .CLKIN1_PERIOD(25.000),      // 40 MHz      

    // OUTPUT CLOCK CONFIGURATION
    .CLKOUT0_DIVIDE_F(5.000),  // 1200 MHz / 5.000 = 240 MHz
    .CLKOUT0_PHASE(0.000),
    .CLKOUT0_DUTY_CYCLE(0.500),
    .CLKOUT0_USE_FINE_PS("TRUE")

  ) mmcm_phi_inst (
    .CLKIN1(esp_clk),     
    .CLKIN2(1'b0),
    .CLKINSEL(1'b1),
    
    .CLKOUT0(clk_240mhz_inst),
    .CLKFBOUT(clk_phi_fb_out),
    .CLKFBIN(clk_phi_fb_in),
    
    .PSCLK(phi_ps_clk),              
    .PSEN(phi_ps_en),                
    .PSINCDEC(phi_ps_incdec),        
    .PSDONE(phi_ps_done),            
    
    .RST(rst),
    .LOCKED(phi_ready),
    .PWRDWN(1'b0)
  );
  BUFG clkfb_phi_buf_inst (
    .O(clk_phi_fb_in),
    .I(clk_phi_fb_out)
  );

  // MMCM 2: phase theta clock for capture window (launch and capture)
  wire clk_theta_fb_out, clk_theta_fb_in;
  wire clk_capture_inst;
  MMCME2_ADV #(
    .BANDWIDTH("OPTIMIZED"),
    .CLKOUT4_CASCADE("FALSE"),
    .COMPENSATION("ZHOLD"),
    .STARTUP_WAIT("FALSE"),

    .DIVCLK_DIVIDE(1),
    .CLKFBOUT_MULT_F(5.000),
    .CLKFBOUT_PHASE(0.000),
    .CLKFBOUT_USE_FINE_PS("FALSE"),
    .CLKIN1_PERIOD(4.167),

    .CLKOUT0_DIVIDE_F(5.000),
    // .CLKOUT0_PHASE(0.000),
    .CLKOUT0_PHASE(180.000),
    .CLKOUT0_DUTY_CYCLE(0.500),
    .CLKOUT0_USE_FINE_PS("TRUE")
  ) mmcm_theta_inst (
    .CLKIN1(clk_240mhz),  // clk_launch
    .CLKIN2(1'b0),
    .CLKINSEL(1'b1),
    
    .CLKOUT0(clk_capture_inst),
    .CLKFBOUT(clk_theta_fb_out),
    .CLKFBIN(clk_theta_fb_in),   
    
    .PSCLK(theta_ps_clk),              
    .PSEN(theta_ps_en),                
    .PSINCDEC(theta_ps_incdec),        
    .PSDONE(theta_ps_done),            
    
    .RST(rst || !phi_ready),
    .LOCKED(theta_ready),
    .PWRDWN(1'b0)
  );
  BUFG clkfb_theta_buf_inst (
    .O(clk_theta_fb_in),
    .I(clk_theta_fb_out)
  );

  // ** add to global routing network
  BUFG sysclk_buf (
      .O           (sysclk_200mhz_passthrough),
      .I           (sysclk_200mhz_inst)
  );
  BUFG clk240mhz_buf (
      .O           (clk_240mhz),
      .I           (clk_240mhz_inst)
  );
  BUFG clk_capture_buf (
      .O           (clk_capture),
      .I           (clk_capture_inst)
  );
endmodule
