package eff.minecraft;

import java.util.*;

public final class ResearchProgramCheck {
  private static int count;

  private static void reject(String s) {
    try {
      ResearchProgram.parse(s);
    } catch (IllegalArgumentException e) {
      count++;
      return;
    }
    throw new AssertionError("accepted invalid program " + s);
  }

  public static void main(String[] args) {
    var p =
        ResearchProgram.parse(
            "assert control.tether.active == true;\n"
                + "disable control.tether; disable event.possess; seal checkpoint.origin");
    if (p.size() != 4 || !p.get(0).expected()) throw new AssertionError("sequence/condition");
    count++;
    if (!ResearchProgram.parse("assert world.exitOpen == false")
        .get(0)
        .field()
        .equals("world.exitOpen")) throw new AssertionError("native camel-case field");
    count++;
    var w =
        ResearchProgram.parse(
                "watch guard when entity.avatar.alive == false -> restore checkpoint.player")
            .get(0);
    if (!w.op().equals("watch") || w.expected() || !w.body().target().equals("checkpoint.player"))
      throw new AssertionError("guard");
    count++;
    if (!ResearchProgram.render(w)
        .equals("watch guard when entity.avatar.alive == false -> restore checkpoint.player"))
      throw new AssertionError("round trip");
    count++;
    for (String s :
        List.of(
            "exec shell",
            "erase entity.player",
            "disable event.all",
            "restore checkpoint.../escape",
            "watch a when x == true -> watch b when x == true -> erase entity.avatar",
            "watch a when x == false -> rebuild instance.world",
            "erase entity.avatar;disable control.tether;disable event.possess;seal"
                + " checkpoint.origin",
            "assert instance.world.active == 1",
            "erase entity.avatar()",
            "System.exit(0)",
            "",
            "x".repeat(4097),
            "inspect instance.world;".repeat(17))) reject(s);
    System.out.println("ResearchProgram: " + count + " checks passed");
  }
}
