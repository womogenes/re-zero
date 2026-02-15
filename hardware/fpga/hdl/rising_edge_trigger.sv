`default_nettype none

module rising_edge_trigger (
    input  wire  clk,
    input  wire  rst,
    input  wire  signal,
    output logic edge_signal
);
  logic prev_signal;

  always_ff @(posedge clk) begin
    if (rst) begin
      prev_signal <= 1'b0;
      edge_signal <= 1'b0;
    end else begin
      prev_signal <= signal;
      edge_signal <= (signal && !prev_signal);
    end
  end
endmodule
`default_nettype wire