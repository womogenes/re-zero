`default_nettype none

module debouncer #(
    parameter CLK_PERIOD_NS = 5,
    parameter DEBOUNCE_TIME_MS = 5
) (
    input  wire  clk,
    input  wire  rst,
    input  wire  dirty,
    output logic clean
);

  localparam DEBOUNCE_CYCLES = $rtoi($ceil(DEBOUNCE_TIME_MS * 1_000_000 / CLK_PERIOD_NS));
  localparam COUNTER_SIZE = $clog2(DEBOUNCE_CYCLES);

  logic [COUNTER_SIZE-1:0] counter;
  logic old_dirty;

  always_ff @(posedge clk) begin
    old_dirty <= dirty;
    if (rst) begin
      counter <= 0;
      clean   <= dirty;
    end else begin
      if (dirty != old_dirty) begin
        counter <= 0;
      end else if (counter < DEBOUNCE_CYCLES) begin
        counter <= counter + 1;
      end else begin
        clean <= dirty;
      end
    end
  end
endmodule


`default_nettype wire