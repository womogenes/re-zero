`default_nettype none

module button_trigger #(
    parameter CLK_PERIOD_NS = 5,
    parameter DEBOUNCE_TIME_MS = 5
) (
    input  wire  clk,
    input  wire  sys_rst,
    input  wire  signal,
    output logic clean_signal
);
  logic debounced_signal;

  debouncer #(
      .CLK_PERIOD_NS(CLK_PERIOD_NS),
      .DEBOUNCE_TIME_MS(DEBOUNCE_TIME_MS)
  ) signal_db (
      .clk  (clk),
      .rst  (sys_rst),
      .dirty(signal),
      .clean(debounced_signal)
  );

  rising_edge_trigger trigger (
      .clk(clk),
      .rst(sys_rst),
      .signal(debounced_signal),
      .edge_signal(clean_signal)
  );
endmodule
`default_nettype wire